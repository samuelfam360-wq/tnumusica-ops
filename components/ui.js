export const LOCATIONS = ["Play Studio", "Xecleration", "Online", "Other"];

export const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
export const money = (n) =>
  "RM " + (Number(n) || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function endTime(time, durationMinutes) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + (Number(durationMinutes) || 0);
  const eh = Math.floor((total % (24 * 60)) / 60);
  const em = total % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

export function timeRange(time, durationMinutes) {
  return `${time}–${endTime(time, durationMinutes)}`;
}

export function KeyNav({ tabs, active, onChange }) {
  return (
    <div className="flex border border-[#1C1B1A] rounded-lg overflow-hidden shadow-sm">
      {tabs.map((t, i) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={[
              "relative flex-1 px-4 py-3 text-sm tracking-wide transition-colors font-medium",
              i !== 0 ? "border-l border-[#1C1B1A]" : "",
              isActive ? "bg-[#1C1B1A] text-[#FAF7F0]" : "bg-[#FAF7F0] text-[#1C1B1A] hover:bg-[#EDE7DB]",
            ].join(" ")}
          >
            {t.label}
            {isActive && (
              <span className="absolute left-1/2 -translate-x-1/2 -bottom-[1px] w-8 h-[3px] bg-[#B8935F] rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function StatCard({ label, value, accent }) {
  return (
    <div className="bg-white border border-[#E7E0D2] rounded-lg px-5 py-4 flex-1 min-w-[140px]">
      <div className="text-[11px] uppercase tracking-wider text-[#8A8272]">{label}</div>
      <div className="text-2xl mt-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: accent || "#1C1B1A" }}>
        {value}
      </div>
    </div>
  );
}

export function SectionCard({ title, action, children }) {
  return (
    <div className="bg-white border border-[#E7E0D2] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#E7E0D2]">
        <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }} className="text-lg">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Button({ children, onClick, variant = "primary", type = "button", disabled }) {
  const base = "px-3.5 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "bg-[#1C1B1A] text-[#FAF7F0] hover:bg-[#332F2C]"
      : variant === "danger"
      ? "bg-transparent text-[#6B2C3E] hover:bg-[#F6EBEE]"
      : "bg-transparent text-[#1C1B1A] border border-[#D8D0BE] hover:bg-[#F3EEE2]";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={base + " " + styles}>
      {children}
    </button>
  );
}

export function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-[#5C564A] text-xs uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "border border-[#D8D0BE] rounded-md px-2.5 py-1.5 text-sm bg-[#FFFEFB] focus:outline-none focus:ring-2 focus:ring-[#B8935F] focus:border-transparent";

export function PianoMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect x="1" y="1" width="26" height="26" rx="4" fill="#1C1B1A" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={3 + i * 5.5} y={3} width="4.5" height="22" fill="#FAF7F0" />
      ))}
      <rect x="8.2" y="3" width="3.4" height="13" fill="#1C1B1A" />
      <rect x="16.4" y="3" width="3.4" height="13" fill="#1C1B1A" />
    </svg>
  );
}

export function StatusPill({ status }) {
  const map = {
    scheduled: ["Scheduled", "#8A8272", "#F3EEE2"],
    completed: ["Completed", "#4C5A43", "#E7EDE1"],
    cancelled: ["Cancelled", "#6B2C3E", "#F6EBEE"],
  };
  const [label, color, bg] = map[status] || map.scheduled;
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ color, background: bg }}>
      {label}
    </span>
  );
}
