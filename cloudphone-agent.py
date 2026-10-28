#!/usr/bin/env python3
"""
cloudphone-agent.py - Gửi ảnh màn hình + CPU/RAM của cloudphone lên Blox Fruit Manager.

Cứ mỗi 5 phút (đổi bằng --interval): chụp màn hình, đo CPU/RAM, ghi vào
Firestore tại users/<uid>/phones/<id>. Tab "Cloudphone" trên web đọc dữ liệu này.

Hai cách chạy:
  1) Chạy NGAY TRÊN cloudphone (Termux hoặc shell của máy):
       python cloudphone-agent.py --local --name "Phone 1" --user minh744 --password '***'
       (nếu máy có root thì thêm --su để chụp màn hình được)
  2) Chạy trên PC/VPS, điều khiển cloudphone qua ADB:
       python cloudphone-agent.py --adb 192.168.1.50:5555 --name "Phone 1" --user minh744 --password '***'

Cần: Python 3.7+ và Pillow (pip install pillow; Termux: pkg install python-pillow).
Có thể đặt tài khoản/mật khẩu bằng biến môi trường BFM_USER, BFM_PASS.
"""
import argparse
import base64
import io
import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# Cấu hình công khai của Firebase project (giống firebase-config.js)
DEFAULT_API_KEY = "AIzaSyDR-8b0__6MFwAsM8imlb7O46znuWn24GM"
DEFAULT_PROJECT = "manager-order-da534"
FAKE_DOMAIN = "@bot-manager.local"
MAX_SHOT_BYTES = 600_000  # Firestore giới hạn 1 MiB/doc, base64 phình thêm ~33%


def log(msg):
    print(time.strftime("[%H:%M:%S] ") + msg, flush=True)


# ---------------------------------------------------------------- Firebase REST
def http_json(url, body=None, headers=None, method=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method or ("POST" if data else "GET"))
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode() or "{}")


class Firebase:
    def __init__(self, api_key, project, user, password):
        self.api_key, self.project = api_key, project
        self.email = user if "@" in user else user.strip().lower() + FAKE_DOMAIN
        self.password = password
        self.token = None
        self.uid = None
        self.expires = 0

    def login(self):
        r = http_json(
            "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + self.api_key,
            {"email": self.email, "password": self.password, "returnSecureToken": True},
        )
        self.token, self.uid = r["idToken"], r["localId"]
        self.expires = time.time() + int(r.get("expiresIn", 3600)) - 300

    def ensure(self):
        if not self.token or time.time() > self.expires:
            self.login()

    def write_phone(self, phone_id, fields):
        """fields: dict tên -> giá trị (str/int/float). Chỉ cập nhật các trường được truyền vào."""
        self.ensure()
        enc = {}
        for k, v in fields.items():
            if isinstance(v, bool):
                enc[k] = {"booleanValue": v}
            elif isinstance(v, int):
                enc[k] = {"integerValue": str(v)}
            elif isinstance(v, float):
                enc[k] = {"doubleValue": v}
            else:
                enc[k] = {"stringValue": str(v)}
        qs = urllib.parse.urlencode([("updateMask.fieldPaths", k) for k in enc])
        url = (
            "https://firestore.googleapis.com/v1/projects/%s/databases/(default)/documents/users/%s/phones/%s?%s"
            % (self.project, self.uid, urllib.parse.quote(phone_id, safe=""), qs)
        )
        try:
            http_json(url, {"fields": enc}, {"Authorization": "Bearer " + self.token}, "PATCH")
        except urllib.error.HTTPError as e:
            if e.code == 401:  # token hết hạn -> đăng nhập lại ở lần sau
                self.token = None
            raise RuntimeError("Firestore HTTP %d: %s" % (e.code, e.read().decode(errors="replace")[:300]))


# ---------------------------------------------------------------- Chạy lệnh trên máy
class Shell:
    def __init__(self, adb, serial, use_su):
        self.adb, self.serial, self.use_su = adb, serial, use_su

    def run(self, cmd, timeout=30):
        if self.adb:
            argv = ["adb"] + (["-s", self.serial] if self.serial else []) + ["exec-out", cmd]
        elif self.use_su:
            argv = ["su", "-c", cmd]
        else:
            argv = ["sh", "-c", cmd]
        p = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
        if p.returncode != 0 and not p.stdout:
            raise RuntimeError("lệnh '%s' lỗi: %s" % (cmd, p.stderr.decode(errors="replace").strip()[:200]))
        return p.stdout


def read_cpu_stat(sh):
    line = sh.run("head -n 1 /proc/stat").decode(errors="replace").split()
    nums = [int(x) for x in line[1:9]]
    idle = nums[3] + nums[4]
    return idle, sum(nums)


def measure_cpu(sh):
    try:
        i1, t1 = read_cpu_stat(sh)
        time.sleep(1.5)
        i2, t2 = read_cpu_stat(sh)
        if t2 > t1:
            return round(max(0.0, min(100.0, 100.0 * (1 - (i2 - i1) / (t2 - t1)))), 1)
    except Exception:
        pass
    # Dự phòng: dumpsys cpuinfo (dòng "xx% TOTAL: ...")
    out = sh.run("dumpsys cpuinfo | grep TOTAL").decode(errors="replace")
    m = re.search(r"([\d.]+)%\s+TOTAL", out)
    if m:
        return round(min(100.0, float(m.group(1))), 1)
    raise RuntimeError("không đọc được CPU")


def measure_ram(sh):
    info = {}
    for line in sh.run("cat /proc/meminfo").decode(errors="replace").splitlines():
        m = re.match(r"(\w+):\s+(\d+)", line)
        if m:
            info[m.group(1)] = int(m.group(2))
    total = info["MemTotal"]
    avail = info.get("MemAvailable")
    if avail is None:
        avail = info.get("MemFree", 0) + info.get("Buffers", 0) + info.get("Cached", 0)
    used = total - avail
    return round(100.0 * used / total, 1), round(used / 1024.0, 1), round(total / 1024.0, 1)


def take_screenshot(sh, max_side, quality):
    from PIL import Image  # import muộn để báo lỗi dễ hiểu

    png = sh.run("screencap -p", timeout=45)
    if not png.startswith(b"\x89PNG"):
        raise RuntimeError("screencap không trả về ảnh PNG (thử thêm --su hoặc kiểm tra ADB)")
    img = Image.open(io.BytesIO(png)).convert("RGB")
    img.thumbnail((max_side, max_side))
    q = quality
    while True:
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=q, optimize=True)
        if buf.tell() <= MAX_SHOT_BYTES or q <= 25:
            break
        q -= 10
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


# ---------------------------------------------------------------- Vòng lặp chính
def main():
    ap = argparse.ArgumentParser(description="Báo cáo ảnh màn hình + CPU/RAM cloudphone lên Blox Fruit Manager")
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--local", action="store_true", help="chạy ngay trên cloudphone")
    mode.add_argument("--adb", metavar="SERIAL", nargs="?", const="", help="điều khiển qua ADB (SERIAL vd 192.168.1.50:5555; bỏ trống nếu chỉ có 1 thiết bị)")
    ap.add_argument("--su", action="store_true", help="chạy lệnh bằng su (máy đã root) - dùng với --local")
    ap.add_argument("--name", default=socket.gethostname(), help="tên hiển thị trên web")
    ap.add_argument("--id", default=None, help="mã thiết bị (mặc định lấy từ --name)")
    ap.add_argument("--user", default=os.environ.get("BFM_USER"), help="tài khoản đăng nhập web quản lý")
    ap.add_argument("--password", default=os.environ.get("BFM_PASS"), help="mật khẩu web quản lý")
    ap.add_argument("--interval", type=int, default=300, help="số giây giữa 2 lần báo cáo (mặc định 300 = 5 phút)")
    ap.add_argument("--max-side", type=int, default=640, help="cạnh dài tối đa của ảnh gửi lên (px)")
    ap.add_argument("--quality", type=int, default=55, help="chất lượng JPEG 30-90")
    ap.add_argument("--api-key", default=DEFAULT_API_KEY)
    ap.add_argument("--project", default=DEFAULT_PROJECT)
    ap.add_argument("--once", action="store_true", help="chỉ báo cáo 1 lần rồi thoát (để test)")
    a = ap.parse_args()

    if not a.user or not a.password:
        ap.error("cần --user và --password (hoặc biến môi trường BFM_USER, BFM_PASS)")
    try:
        import PIL  # noqa: F401
    except ImportError:
        sys.exit("Thiếu Pillow. Cài bằng: pip install pillow  (Termux: pkg install python-pillow)")

    phone_id = a.id or (re.sub(r"[^a-z0-9]+", "-", a.name.lower()).strip("-") or "phone")
    sh = Shell(adb=a.adb is not None, serial=a.adb, use_su=a.su)
    fb = Firebase(a.api_key, a.project, a.user, a.password)

    log("Bắt đầu: thiết bị '%s' (id=%s), báo cáo mỗi %d giây" % (a.name, phone_id, a.interval))
    next_run = time.monotonic()
    while True:
        fields = {"name": a.name, "interval": a.interval}
        problems = []
        try:
            fields["cpu"] = measure_cpu(sh)
        except Exception as e:
            problems.append("CPU: %s" % e)
        try:
            pct, used, total = measure_ram(sh)
            fields.update(ram=pct, ramUsed=used, ramTotal=total)
        except Exception as e:
            problems.append("RAM: %s" % e)
        try:
            fields["shot"] = take_screenshot(sh, a.max_side, a.quality)
        except Exception as e:
            problems.append("Ảnh: %s" % e)

        fields["updated"] = int(time.time() * 1000)
        try:
            fb.write_phone(phone_id, fields)
            log("Đã gửi: CPU %s%%, RAM %s%%, ảnh %s%s" % (
                fields.get("cpu", "?"), fields.get("ram", "?"),
                "có (%d KB)" % (len(fields["shot"]) // 1024) if "shot" in fields else "không",
                " | cảnh báo: " + "; ".join(problems) if problems else ""))
        except Exception as e:
            log("Gửi thất bại, sẽ thử lại ở lần sau: %s" % e)

        if a.once:
            break
        next_run += a.interval
        time.sleep(max(1, next_run - time.monotonic()))
        if next_run < time.monotonic():  # máy ngủ/treo lâu -> không dồn nhiều lần
            next_run = time.monotonic()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
