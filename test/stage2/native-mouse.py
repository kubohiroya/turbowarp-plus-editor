"""Small macOS HID driver used by the stage 2 integration test."""
import ctypes as c
import sys
import time


class Point(c.Structure):
    _fields_ = [("x", c.c_double), ("y", c.c_double)]


cg = c.CDLL("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics")
cf = c.CDLL("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
cg.CGPreflightPostEventAccess.restype = c.c_bool
cg.CGEventCreateMouseEvent.argtypes = [c.c_void_p, c.c_uint, Point, c.c_uint]
cg.CGEventCreateMouseEvent.restype = c.c_void_p
cg.CGEventSetIntegerValueField.argtypes = [c.c_void_p, c.c_uint, c.c_int64]
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
