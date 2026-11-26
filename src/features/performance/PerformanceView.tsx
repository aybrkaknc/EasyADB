import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { commands, type DeviceEntry } from "../../bindings";
import { formatBytes, percent } from "../../shared/lib/format";
import { DeviceGuard } from "../../shared/ui/DeviceGuard";
import { ProgressBar, Spinner } from "../../shared/ui/Feedback";
import { KeyValue } from "../../shared/ui/Panel";
import { SubHeading } from "../../shared/ui/SubHeading";

const HISTORY = 60;

export function Sparkline({ values, max = 100 }: { values: number[]; max?: number }) {
  if (values.length < 2) return <div className="h-10" />;
  const points = values
    .map((v, i) => `${(i / (HISTORY - 1)) * 100},${40 - (Math.min(v, max) / max) * 38}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-10 w-full" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Tile({
  title,
  value,
  sub,
  bar,
  history,
}: {
  title: string;
  value: string;
  sub?: string;
  bar?: number | null;
  history?: number[];
}) {
  return (
    <div className="min-w-0">
      <p className="label">{title}</p>
      <p className="font-display text-2xl font-bold text-white tabular-nums">{value}</p>
      {sub && <p className="mt-1 truncate text-[11px] text-white/60">{sub}</p>}
      {bar !== undefined && (
        <div className="mt-2">
          <ProgressBar value={bar} />
        </div>
      )}
      {history && (
        <div className="mt-2 text-neon/70">
          <Sparkline values={history} />
        </div>
      )}
    </div>
  );
}

function Metrics({ device }: { device: DeviceEntry }) {
  const { t } = useTranslation();
  // History is accumulated inside the query function so each sample is recorded exactly once.
  const historyRef = useRef<{ cpu: number[]; ram: number[] }>({ cpu: [], ram: [] });
  const live = useQuery({
    queryKey: ["live", device.serial],
    queryFn: async () => {
      const metrics = await commands.getLiveMetrics(device.serial);
      const total = metrics.memTotalKb ?? 0;
      const ram = percent(total - (metrics.memAvailableKb ?? 0), total);
      const prev = historyRef.current;
      historyRef.current = {
        cpu: [...prev.cpu, metrics.cpuPercent ?? 0].slice(-HISTORY),
        ram: [...prev.ram, ram].slice(-HISTORY),
      };
      return { metrics, history: historyRef.current };
    },
    refetchInterval: 2000,
  });
  const hw = useQuery({
    queryKey: ["hardware", device.serial],
    queryFn: () => commands.getHardwareInfo(device.serial),
    staleTime: Infinity,
  });
  const net = useQuery({
    queryKey: ["network", device.serial],
    queryFn: () => commands.getNetworkInfo(device.serial),
    refetchInterval: 10000,
  });

  const m = live.data?.metrics;
  const history = live.data?.history ?? { cpu: [], ram: [] };
  if (!m)
    return (
      <div className="p-6">
        <Spinner label={t("common.loading")} />
      </div>
    );
  const memTotal = (m.memTotalKb ?? 0) * 1024;
  const ramUsed = memTotal - (m.memAvailableKb ?? 0) * 1024;
  const storageUsed = (m.storage?.usedKb ?? 0) * 1024;
  const storageTotal = (m.storage?.totalKb ?? 0) * 1024;
  const b = m.battery;
  const d = hw.data?.device;
  return (
    <div className="m-6 flex flex-col gap-6 self-start">
      <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
        <Tile
          title={t("performance.cpu")}
          value={m.cpuPercent === null ? "-" : `${m.cpuPercent.toFixed(0)}%`}
          sub={
            m.loadAverage === null
              ? undefined
              : `${t("performance.load")} ${m.loadAverage.toFixed(2)}`
          }
          history={history.cpu}
        />
        <Tile
          title={t("performance.ram")}
          value={`${percent(ramUsed, memTotal).toFixed(0)}%`}
          sub={`${formatBytes(ramUsed)} / ${formatBytes(memTotal)}`}
          history={history.ram}
        />
        <Tile
          title={t("performance.battery")}
          value={b.level === null ? "-" : `${b.level}%`}
          sub={[
            t(`performance.batteryStatus.${b.status}`),
            b.temperatureC === null ? null : `${b.temperatureC.toFixed(1)} C`,
            b.voltageMv === null ? null : `${(b.voltageMv / 1000).toFixed(2)} V`,
          ]
            .filter(Boolean)
            .join(" | ")}
          bar={b.level}
        />
        <Tile
          title={t("performance.storage")}
          value={m.storage ? `${percent(storageUsed, storageTotal).toFixed(0)}%` : "-"}
          sub={m.storage ? `${formatBytes(storageUsed)} / ${formatBytes(storageTotal)}` : undefined}
          bar={m.storage ? percent(storageUsed, storageTotal) : null}
        />
      </div>
      <div className="grid grid-cols-1 gap-5 border-t border-white/10 pt-5 md:grid-cols-2">
        <section>
          <SubHeading>{t("performance.hardware.title")}</SubHeading>
          {hw.data && d ? (
            <KeyValue
              rows={[
                [t("performance.hardware.brand"), hw.data.brand],
                [t("device.info.model"), d.model],
                [t("performance.hardware.soc"), hw.data.soc],
                [t("performance.hardware.cores"), hw.data.cpuCores?.toString() ?? ""],
                [t("device.info.android"), `${d.androidVersion} (SDK ${d.sdk})`],
                [t("performance.hardware.kernel"), hw.data.kernel],
                [t("performance.hardware.resolution"), hw.data.resolution],
                [t("performance.hardware.density"), hw.data.density],
                [t("performance.hardware.ram"), formatBytes((hw.data.ramTotalKb ?? 0) * 1024)],
                [
                  t("performance.hardware.storage"),
                  formatBytes((hw.data.storageTotalKb ?? 0) * 1024),
                ],
                [
                  t("device.info.bootloader"),
                  d.bootloaderLocked === null
                    ? t("common.unknown")
                    : t(d.bootloaderLocked ? "device.info.locked" : "device.info.unlocked"),
                ],
                [t("device.info.verifiedBoot"), d.verifiedBoot],
                [t("device.info.selinux"), d.selinux],
              ]}
            />
          ) : (
            <Spinner label={t("common.loading")} />
          )}
        </section>
        <section>
          <SubHeading>{t("performance.network.title")}</SubHeading>
          {net.data?.wifiIp ? (
            <KeyValue
              rows={[
                [t("performance.network.ip"), net.data.wifiIp],
                [t("performance.network.ssid"), net.data.ssid ?? "-"],
                [
                  t("performance.network.rssi"),
                  net.data.rssi === null ? "-" : `${net.data.rssi} dBm`,
                ],
                [
                  t("performance.network.speed"),
                  net.data.linkSpeedMbps === null ? "-" : `${net.data.linkSpeedMbps} Mbps`,
                ],
                [
                  t("performance.network.frequency"),
                  net.data.frequencyMhz === null ? "-" : `${net.data.frequencyMhz} MHz`,
                ],
              ]}
            />
          ) : (
            <p className="text-xs text-white/50">{t("performance.network.offline")}</p>
          )}
        </section>
      </div>
    </div>
  );
}

export function PerformanceTab() {
  return <DeviceGuard>{(device) => <Metrics key={device.serial} device={device} />}</DeviceGuard>;
}
