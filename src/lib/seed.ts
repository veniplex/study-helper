import { eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import {
  assignment,
  deck,
  degreeProgram,
  flashcard,
  goalAttempt,
  moduleContact,
  moduleGoal,
  question,
  quiz,
  semester,
  studyEvent,
  studyModule,
  user,
  userPrefs,
} from "@/db/schema"
import { getAuth } from "@/lib/auth"

/** Test accounts created by the SEED_TEST_DATA seed. */
export const SEED_ACCOUNTS = {
  admin: { email: "admin@example.com", password: "admin-test-1234", name: "Test Admin" },
  user: { email: "user@example.com", password: "user-test-1234", name: "Test User" },
} as const

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (base: Date, days: number) => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

/** Demo study content for one user: program, two semesters, modules with
 * grades/assignments/events, a flashcard deck and a quiz. */
async function seedStudyContent(userId: string) {
  const now = new Date()

  // Every `!` below is on an insert(...).returning() result: the row count
  // always matches the number of literal values inserted, or the insert throws.
  // This seed only ever runs behind SEED_TEST_DATA.
  const [program] = await db
    .insert(degreeProgram)
    .values({
      userId,
      name: "Informatik",
      degreeType: "B.Sc.",
      institution: "Beispiel-Universität",
      targetEcts: 180,
    })
    .returning()

  const [pastSemester, currentSemester] = await db
    .insert(semester)
    .values([
      {
        programId: program!.id,
        name: "1. Semester",
        startDate: iso(addDays(now, -210)),
        endDate: iso(addDays(now, -30)),
        sortOrder: 0,
      },
      {
        programId: program!.id,
        name: "2. Semester",
        startDate: iso(addDays(now, -29)),
        endDate: iso(addDays(now, 150)),
        sortOrder: 1,
      },
    ])
    .returning()

  const [math1, prog1, math2, algo] = await db
    .insert(studyModule)
    .values([
      {
        semesterId: pastSemester!.id,
        name: "Mathematik 1",
        code: "MA101",
        ects: 8,
        status: "passed",
        icon: "sigma",
        color: "blue",
        instructor: "Prof. Dr. Gauß",
        sortOrder: 0,
      },
      {
        semesterId: pastSemester!.id,
        name: "Programmierung 1",
        code: "IN101",
        ects: 10,
        status: "passed",
        icon: "code",
        color: "emerald",
        instructor: "Prof. Dr. Hopper",
        sortOrder: 1,
      },
      {
        semesterId: currentSemester!.id,
        name: "Mathematik 2",
        code: "MA201",
        ects: 8,
        status: "active",
        icon: "function-square",
        color: "violet",
        sortOrder: 0,
      },
      {
        semesterId: currentSemester!.id,
        name: "Algorithmen & Datenstrukturen",
        code: "IN201",
        ects: 10,
        status: "active",
        icon: "network",
        color: "amber",
        sortOrder: 1,
      },
    ])
    .returning()

  // Learning goals: each module has a graded exam goal (title = former
  // examType); Mathematik 2 additionally has a bonus assignments goal.
  const goals = await db
    .insert(moduleGoal)
    .values([
      { moduleId: math1!.id, type: "exam", title: "Klausur", gradingRole: "grade" },
      { moduleId: prog1!.id, type: "exam", title: "Klausur", gradingRole: "grade" },
      { moduleId: math2!.id, type: "exam", title: "Klausur", gradingRole: "grade" },
      {
        moduleId: math2!.id,
        type: "assignments",
        gradingRole: "bonus",
        config: { bonus: { type: "percent_points", value: 5, minCompletedShare: 0.5 } },
      },
      { moduleId: algo!.id, type: "exam", title: "Klausur", gradingRole: "grade" },
    ])
    .returning()

  // Passed modules get a graded attempt on their grade goal.
  const gradeGoalByModule = new Map(
    goals.filter((g) => g.gradingRole === "grade").map((g) => [g.moduleId, g.id])
  )
  await db.insert(goalAttempt).values([
    {
      goalId: gradeGoalByModule.get(math1!.id)!,
      attempt: 1,
      resultPercent: "78",
      passed: true,
      date: iso(addDays(now, -45)),
    },
    {
      goalId: gradeGoalByModule.get(prog1!.id)!,
      attempt: 1,
      resultPercent: "91",
      passed: true,
      date: iso(addDays(now, -40)),
    },
  ])

  await db.insert(moduleContact).values([
    {
      moduleId: math2!.id,
      name: "Prof. Dr. Noether",
      email: "noether@example-uni.de",
      role: "Dozentin",
    },
    { moduleId: math2!.id, name: "Max Tutor", email: "tutor@example-uni.de", role: "Tutor" },
  ])

  await db.insert(assignment).values([
    {
      userId,
      moduleId: math2!.id,
      title: "Übungsblatt 1",
      kind: "graded",
      status: "graded",
      dueDate: iso(addDays(now, -7)),
      pointsAchieved: "18",
      pointsMax: "20",
    },
    {
      userId,
      moduleId: math2!.id,
      title: "Übungsblatt 2",
      kind: "graded",
      status: "open",
      dueDate: iso(addDays(now, 7)),
      pointsMax: "20",
    },
    {
      userId,
      moduleId: algo!.id,
      title: "Sortieralgorithmen implementieren",
      kind: "practice",
      status: "open",
      dueDate: iso(addDays(now, 10)),
    },
  ])

  const lectureStart = new Date(now)
  lectureStart.setHours(10, 0, 0, 0)
  const examStart = addDays(now, 30)
  examStart.setHours(9, 0, 0, 0)
  await db.insert(studyEvent).values([
    {
      userId,
      moduleId: math2!.id,
      type: "lecture",
      title: "Vorlesung Mathematik 2",
      startsAt: addDays(lectureStart, 1),
      endsAt: new Date(addDays(lectureStart, 1).getTime() + 90 * 60 * 1000),
      location: "Hörsaal 1",
    },
    {
      userId,
      moduleId: math2!.id,
      type: "exam",
      title: "Klausur Mathematik 2",
      startsAt: examStart,
      endsAt: new Date(examStart.getTime() + 120 * 60 * 1000),
      location: "Audimax",
    },
    {
      userId,
      moduleId: math2!.id,
      type: "deadline",
      title: "Abgabe Übungsblatt 2",
      startsAt: addDays(now, 7),
      allDay: true,
    },
  ])

  const [mathDeck] = await db
    .insert(deck)
    .values({ userId, moduleId: math2!.id, name: "Analysis Grundbegriffe" })
    .returning()
  await db.insert(flashcard).values([
    { deckId: mathDeck!.id, front: "Was ist eine Cauchy-Folge?", back: "Eine Folge, bei der die Glieder ab einem Index beliebig nah beieinander liegen: ∀ε>0 ∃N: |aₙ−aₘ|<ε für n,m≥N." },
    { deckId: mathDeck!.id, front: "Definition Stetigkeit (ε-δ)", back: "f ist stetig in x₀, wenn ∀ε>0 ∃δ>0: |x−x₀|<δ ⇒ |f(x)−f(x₀)|<ε." },
    { deckId: mathDeck!.id, front: "Was besagt der Zwischenwertsatz?", back: "Eine auf [a,b] stetige Funktion nimmt jeden Wert zwischen f(a) und f(b) an." },
    { deckId: mathDeck!.id, front: "Ableitung von sin(x)", back: "cos(x)" },
  ])

  const [algoQuiz] = await db
    .insert(quiz)
    .values({
      userId,
      moduleId: algo!.id,
      title: "Sortierverfahren Basics",
      description: "Laufzeiten und Eigenschaften der wichtigsten Sortieralgorithmen.",
    })
    .returning()
  await db.insert(question).values([
    {
      quizId: algoQuiz!.id,
      kind: "multiple_choice",
      prompt: "Welche Worst-Case-Laufzeit hat Quicksort?",
      options: ["O(n log n)", "O(n²)", "O(n)", "O(log n)"],
      correctIndex: 1,
      explanation: "Bei ungünstiger Pivot-Wahl (z. B. sortierte Eingabe) degeneriert Quicksort zu O(n²).",
      sortOrder: 0,
    },
    {
      quizId: algoQuiz!.id,
      kind: "multiple_choice",
      prompt: "Welches Verfahren ist stabil?",
      options: ["Heapsort", "Quicksort", "Mergesort", "Selectionsort"],
      correctIndex: 2,
      explanation: "Mergesort erhält die relative Reihenfolge gleicher Schlüssel.",
      sortOrder: 1,
    },
    {
      quizId: algoQuiz!.id,
      kind: "free_text",
      prompt: "Erkläre kurz das Prinzip von Divide and Conquer.",
      referenceAnswer:
        "Problem in kleinere Teilprobleme zerlegen, diese rekursiv lösen und die Teillösungen zur Gesamtlösung kombinieren.",
      sortOrder: 2,
    },
  ])

  await db
    .insert(userPrefs)
    .values({ userId, activeProgramId: program!.id })
    .onConflictDoUpdate({ target: userPrefs.userId, set: { activeProgramId: program!.id } })
}

/**
 * Idempotent test seed, enabled with SEED_TEST_DATA=true: creates an admin and
 * a regular user (see SEED_ACCOUNTS), each with demo study content. Skipped
 * entirely if any seed account already exists.
 */
export async function runTestSeed() {
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.email, [SEED_ACCOUNTS.admin.email, SEED_ACCOUNTS.user.email]))
  if (existing.length > 0) {
    console.log("[seed] test accounts already exist — skipping")
    return
  }

  const auth = await getAuth()
  // Order matters on an empty database: the first user becomes admin.
  const adminRes = await auth.api.signUpEmail({ body: { ...SEED_ACCOUNTS.admin } })
  // If the DB was not empty, the first-user-becomes-admin hook did not fire.
  await db.update(user).set({ role: "admin" }).where(eq(user.id, adminRes.user.id))
  const userRes = await auth.api.signUpEmail({ body: { ...SEED_ACCOUNTS.user } })

  await seedStudyContent(adminRes.user.id)
  await seedStudyContent(userRes.user.id)

  console.log(
    `[seed] created test accounts: ${SEED_ACCOUNTS.admin.email} / ${SEED_ACCOUNTS.admin.password} (admin), ` +
      `${SEED_ACCOUNTS.user.email} / ${SEED_ACCOUNTS.user.password} (user)`
  )
}
