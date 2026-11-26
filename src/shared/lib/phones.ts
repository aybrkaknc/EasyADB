import type { DeviceEntry } from "../../bindings";

/** Every connection to one phone. */
export interface Phone {
  key: string;
  name: string;
  devices: DeviceEntry[];
}

export const phoneKey = (device: DeviceEntry) => device.phone ?? device.serial;

export function groupPhones(devices: DeviceEntry[]): Phone[] {
  const phones: Phone[] = [];
  for (const device of devices) {
    const key = phoneKey(device);
    let phone = phones.find((p) => p.key === key);
    if (!phone) {
      phone = { key, name: device.serial, devices: [] };
      phones.push(phone);
    }
    phone.devices.push(device);
    const model = phone.devices.find((d) => d.model)?.model;
    phone.name = model ?? phone.devices[0]!.serial;
  }
  for (const phone of phones) {
    phone.devices.sort((a, b) => Number(b.kind === "usb") - Number(a.kind === "usb"));
  }
  return phones;
}

const ready = (device: DeviceEntry) => device.state === "device";

const usbOf = (devices: DeviceEntry[], key: string) =>
  devices.find((d) => d.kind === "usb" && ready(d) && phoneKey(d) === key);

export interface Selection {
  serial: string | null;
  /** The user picked a wireless connection while the cable was plugged in. */
  pinned: boolean;
}

/**
 * The connection to use after the list of devices changed. A cable takes over from the wireless
 * connection of the same phone unless something runs or the user chose otherwise; a connection
 * that disappears hands over to another one of the same phone.
 */
export function pickSerial(
  before: DeviceEntry[],
  devices: DeviceEntry[],
  selection: Selection,
  free: boolean,
): Selection {
  const current = devices.find((d) => d.serial === selection.serial);
  if (current) {
    if (current.kind !== "wifi") return { serial: current.serial, pinned: false };
    const usb = usbOf(devices, phoneKey(current));
    if (!usb) return { serial: current.serial, pinned: false };
    if (selection.pinned || !free) return selection;
    return { serial: usb.serial, pinned: false };
  }
  const gone = before.find((d) => d.serial === selection.serial);
  const sibling = gone && devices.find((d) => ready(d) && phoneKey(d) === phoneKey(gone));
  const first = devices.find(ready) ?? devices[0];
  // At the start a cable is preferred over the wireless connection of the same phone.
  const preferred = first && (usbOf(devices, phoneKey(first)) ?? first);
  return { serial: (sibling ?? preferred)?.serial ?? null, pinned: false };
}

export interface Change {
  kind: "wirelessOn" | "wirelessOff" | "usbOn" | "usbOff" | "usbSwitched" | "authorize";
  key: string;
  name: string;
}

/** Connections that are usable, one entry per phone and way of connecting. */
function usable(devices: DeviceEntry[]) {
  const found = new Map<string, DeviceEntry>();
  for (const device of devices) {
    if (device.kind === "emulator") continue;
    if (device.state === "unauthorized" || device.state === "offline") continue;
    found.set(`${device.kind}|${phoneKey(device)}`, device);
  }
  return found;
}

/** What happened to the connections between two device lists, worth telling the user. */
export function connectionChanges(
  before: DeviceEntry[],
  after: DeviceEntry[],
  selectedBefore: string | null,
  selectedAfter: string | null,
): Change[] {
  const old = usable(before);
  const now = usable(after);
  const change = (kind: Change["kind"], device: DeviceEntry): Change => ({
    kind,
    key: phoneKey(device),
    name: device.model ?? device.serial,
  });
  const changes: Change[] = [];
  for (const [id, device] of now) {
    if (old.has(id)) continue;
    if (device.kind === "wifi") changes.push(change("wirelessOn", device));
    else {
      const was = before.find((d) => d.serial === selectedBefore);
      const switched =
        selectedAfter === device.serial &&
        was?.kind === "wifi" &&
        phoneKey(was) === phoneKey(device);
      changes.push(change(switched ? "usbSwitched" : "usbOn", device));
    }
  }
  for (const [id, device] of old) {
    if (!now.has(id)) {
      changes.push(change(device.kind === "wifi" ? "wirelessOff" : "usbOff", device));
    }
  }
  for (const device of after) {
    if (device.state !== "unauthorized") continue;
    const asked = before.some((d) => d.serial === device.serial && d.state === "unauthorized");
    if (!asked) changes.push(change("authorize", device));
  }
  return changes;
}
