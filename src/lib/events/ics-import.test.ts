import { describe, expect, it } from "vitest"
import { parseIcs } from "./ics-import"

const SAMPLE = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:abc@uni",
  "SUMMARY:Vorlesung Analysis\\, Teil 2",
  "DTSTART;TZID=Europe/Berlin:20260413T100000",
  "DTEND;TZID=Europe/Berlin:20260413T113000",
  "LOCATION:HS 3",
  "RRULE:FREQ=WEEKLY;UNTIL=20260713T220000Z",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:def@uni",
  "SUMMARY:Klausur",
  "DTSTART;VALUE=DATE:20260810",
  "DESCRIPTION:Raum wird noch\\nbekannt gegeben",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n")

describe("parseIcs", () => {
  it("parses timed events with weekly RRULE", () => {
    const events = parseIcs(SAMPLE)
    expect(events).toHaveLength(2)
    const [lecture] = events
    expect(lecture.title).toBe("Vorlesung Analysis, Teil 2")
    expect(lecture.startsAt.getHours()).toBe(10)
    expect(lecture.endsAt?.getMinutes()).toBe(30)
    expect(lecture.location).toBe("HS 3")
    expect(lecture.recurrence).toBe("weekly")
    expect(lecture.recurrenceUntil).toMatch(/^2026-07-1[34]$/)
  })

  it("parses all-day events and unescapes text", () => {
    const [, exam] = parseIcs(SAMPLE)
    expect(exam.allDay).toBe(true)
    expect(exam.notes).toBe("Raum wird noch\nbekannt gegeben")
    expect(exam.recurrence).toBe("none")
  })

  it("unfolds continuation lines", () => {
    const folded = [
      "BEGIN:VEVENT",
      "SUMMARY:Sehr langer Ti",
      " tel mit Fortsetzung",
      "DTSTART:20260101T090000Z",
      "END:VEVENT",
    ].join("\r\n")
    const [ev] = parseIcs(folded)
    expect(ev.title).toBe("Sehr langer Titel mit Fortsetzung")
  })

  it("ignores broken events", () => {
    expect(parseIcs("BEGIN:VEVENT\r\nSUMMARY:ohne datum\r\nEND:VEVENT")).toHaveLength(0)
  })
})
