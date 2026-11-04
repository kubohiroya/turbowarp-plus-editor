"""Small macOS HID driver used by the stage 2 integration test."""
import ctypes as c
import os
import sys
import time


if os.environ.get("TW_PLUS_NATIVE_INPUT") != "1":
    raise SystemExit("Set TW_PLUS_NATIVE_INPUT=1 to send macOS system input.")


class Point(c.Structure):
    _fields_ = [("x", c.c_double), ("y", c.c_double)]


cg = c.CDLL("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics")
cf = c.CDLL("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
cg.CGPreflightPostEventAccess.restype = c.c_bool
cg.CGEventCreateMouseEvent.argtypes = [c.c_void_p, c.c_uint, Point, c.c_uint]
cg.CGEventCreateMouseEvent.restype = c.c_void_p
cg.CGEventSetIntegerValueField.argtypes = [c.c_void_p, c.c_uint, c.c_int64]
cg.CGEventCreateKeyboardEvent.argtypes = [c.c_void_p, c.c_ushort, c.c_bool]
cg.CGEventCreateKeyboardEvent.restype = c.c_void_p
cg.CGEventPost.argtypes = [c.c_uint, c.c_void_p]
cf.CFRelease.argtypes = [c.c_void_p]


def mouse(kind, point):
    event = cg.CGEventCreateMouseEvent(None, kind, Point(*point), 0)
    if not event:
        raise RuntimeError("Could not create mouse event")
    if kind in (1, 2):
        cg.CGEventSetIntegerValueField(event, 1, 1)  # kCGMouseEventClickState
    cg.CGEventPost(0, event)  # kCGHIDEventTap
    cf.CFRelease(event)


if not cg.CGPreflightPostEventAccess():
    raise SystemExit("macOS cannot post mouse events")
if sys.argv[1] in ('--key-down', '--key-up'):
    event = cg.CGEventCreateKeyboardEvent(None, int(sys.argv[2]), sys.argv[1] == '--key-down')
    if not event:
        raise RuntimeError("Could not create keyboard event")
    cg.CGEventPost(0, event)
    cf.CFRelease(event)
    raise SystemExit(0)
if sys.argv[1] == '--click':
    point = tuple(map(float, sys.argv[2:]))
    mouse(5, point)
    time.sleep(0.12)
    mouse(1, point)
    time.sleep(0.06)
    mouse(2, point)
    raise SystemExit(0)
x, y, end_x, end_y = map(float, sys.argv[1:])
mouse(5, (x, y))
time.sleep(0.12)
# Activate the source using the same native path as the drag.
mouse(1, (x, y))
time.sleep(0.06)
mouse(2, (x, y))
time.sleep(0.60)
mouse(1, (x, y))
try:
    time.sleep(0.18)
    # Cross the drag threshold while the pointer is still over the source.
    mouse(6, (x + (7 if end_x > x else -7), y))
    time.sleep(0.10)
    for step in range(1, 51):
        mouse(6, (x + (end_x - x) * step / 50, y + (end_y - y) * step / 50))
        time.sleep(0.025)
    time.sleep(0.28)
finally:
    mouse(2, (end_x, end_y))
