type IcsEvent = {
  id: string
  title: string
  startsAt: Date
  endsAt: Date | null
  location: string | null
  notes: string | null
}

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n")
}

/** Fold lines at 75 octets per RFC 5545. */
function fold(line: string): string {
  const chunks: string[] = []
  let rest = line
  while (rest.length > 73) {
    chunks.push(rest.slice(0, 73))
    rest = " " + rest.slice(73)
  }
  chunks.push(rest)
  return chunks.join("\r\n")
}

export function buildIcsCalendar(name: string, events: IcsEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//StudyHelper//Calendar//EN",
    fold(`X-WR-CALNAME:${escapeText(name)}`),
  ]
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      fold(`UID:${e.id}@studyhelper`),
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(e.startsAt)}`,
      ...(e.endsAt ? [`DTEND:${icsDate(e.endsAt)}`] : []),
      fold(`SUMMARY:${escapeText(e.title)}`),
      ...(e.location ? [fold(`LOCATION:${escapeText(e.location)}`)] : []),
      ...(e.notes ? [fold(`DESCRIPTION:${escapeText(e.notes)}`)] : []),
      "END:VEVENT"
    )
  }
  lines.push("END:VCALENDAR")
  return lines.join("\r\n") + "\r\n"
}
