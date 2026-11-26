import { describe, expect, it } from "vitest";

import type { DeviceEntry } from "../../bindings";
import { connectionChanges, groupPhones, pickSerial } from "./phones";

const device = (
  serial: string,
  kind: DeviceEntry["kind"],
  phone: string | null = "a",
  state: DeviceEntry["state"] = "device",
): DeviceEntry => ({ serial, kind, phone, state, model: "Munch", product: null });

const usb = device("a", "usb");
const wifi = device("10.0.0.2:1", "wifi");
const other = device("b", "usb", "b");
const pick = (
  before: DeviceEntry[],
  devices: DeviceEntry[],
  serial: string | null,
  free = true,
  pinned = false,
) => pickSerial(before, devices, { serial, pinned }, free);

describe("groupPhones", () => {
  it("lists a phone once, the cable first", () => {
    const phones = groupPhones([wifi, other, usb]);
    expect(phones.map((p) => p.key)).toEqual(["a", "b"]);
    expect(phones[0]!.devices).toEqual([usb, wifi]);
    expect(phones[0]!.name).toBe("Munch");
  });

  it("keeps unknown phones apart", () => {
    const phones = groupPhones([device("x:1", "wifi", null), device("y:1", "wifi", null)]);
    expect(phones).toHaveLength(2);
  });
});

describe("pickSerial", () => {
  it("takes the first ready phone, by cable if it can", () => {
    expect(pick([], [wifi, usb], null).serial).toBe("a");
    expect(pick([], [], null).serial).toBeNull();
  });

  it("moves to the cable only while nothing runs", () => {
    expect(pick([wifi], [wifi, usb], wifi.serial).serial).toBe("a");
    expect(pick([wifi], [wifi, usb], wifi.serial, false).serial).toBe(wifi.serial);
  });

  it("keeps a wireless connection the user chose until the cable is gone", () => {
    const chosen = pick([wifi, usb], [wifi, usb], wifi.serial, true, true);
    expect(chosen).toEqual({ serial: wifi.serial, pinned: true });
    expect(pick([wifi, usb], [wifi], wifi.serial, true, true).pinned).toBe(false);
  });

  it("leaves another phone alone", () => {
    expect(pick([wifi], [wifi, other], wifi.serial).serial).toBe(wifi.serial);
  });

  it("falls back to the same phone when the connection disappears", () => {
    expect(pick([other, usb, wifi], [other, wifi], "a").serial).toBe(wifi.serial);
    expect(pick([other, usb], [other], "a").serial).toBe("b");
  });
});

describe("connectionChanges", () => {
  const kinds = (before: DeviceEntry[], after: DeviceEntry[], from = "", to = "") =>
    connectionChanges(before, after, from, to).map((c) => c.kind);

  it("tells what came and went", () => {
    expect(kinds([], [wifi])).toEqual(["wirelessOn"]);
    expect(kinds([wifi, usb], [])).toEqual(["wirelessOff", "usbOff"]);
    expect(kinds([], [usb])).toEqual(["usbOn"]);
  });

  it("says when the selection moved to the cable", () => {
    expect(kinds([wifi], [wifi, usb], wifi.serial, "a")).toEqual(["usbSwitched"]);
  });

  it("stays quiet when only the serial of a connection changes", () => {
    expect(kinds([wifi], [device("10.0.0.2:2", "wifi")])).toEqual([]);
  });

  it("asks once for the permission on the phone", () => {
    const locked = device("a", "usb", "a", "unauthorized");
    expect(kinds([], [locked])).toEqual(["authorize"]);
    expect(kinds([locked], [locked])).toEqual([]);
    expect(kinds([locked], [usb])).toEqual(["usbOn"]);
  });
});
