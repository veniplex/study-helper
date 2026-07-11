import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"
import { studyModule } from "./studies"

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

// ---- Study plans ---------------------------------------------------------------

export const studyPlan = pgTable(
  "study_plan",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    moduleId: text("module_id").references(() => studyModule.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("study_plan_userId_idx").on(t.userId)]
)

export const studyPlanItem = pgTable(
  "study_plan_item",
  {
    id: id(),
    planId: text("plan_id")
      .notNull()
      .references(() => studyPlan.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    scheduledDate: date("scheduled_date"),
    durationMinutes: integer("duration_minutes"),
    done: boolean("done").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("study_plan_item_planId_idx").on(t.planId)]
)

// ---- Flashcards (FSRS) ---------------------------------------------------------

export const deck = pgTable(
  "deck",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    moduleId: text("module_id").references(() => studyModule.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("deck_userId_idx").on(t.userId)]
)

/** FSRS state: 0=New 1=Learning 2=Review 3=Relearning */
export const flashcard = pgTable(
  "flashcard",
  {
    id: id(),
    deckId: text("deck_id")
      .notNull()
      .references(() => deck.id, { onDelete: "cascade" }),
    front: text("front").notNull(),
    back: text("back").notNull(),
    // FSRS scheduling fields
    due: timestamp("due", { withTimezone: true }).notNull().defaultNow(),
    stability: real("stability").notNull().default(0),
    difficulty: real("difficulty").notNull().default(0),
    elapsedDays: real("elapsed_days").notNull().default(0),
    scheduledDays: real("scheduled_days").notNull().default(0),
    learningSteps: integer("learning_steps").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    state: integer("state").notNull().default(0),
    lastReview: timestamp("last_review", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("flashcard_deckId_idx").on(t.deckId), index("flashcard_due_idx").on(t.due)]
)

export const reviewLog = pgTable(
  "review_log",
  {
    id: id(),
    cardId: text("card_id")
      .notNull()
      .references(() => flashcard.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(), // 1=Again 2=Hard 3=Good 4=Easy
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("review_log_cardId_idx").on(t.cardId),
    index("review_log_userId_idx").on(t.userId),
  ]
)

// ---- Quizzes -------------------------------------------------------------------

export type QuestionKind = "multiple_choice" | "free_text"

export const quiz = pgTable(
  "quiz",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    moduleId: text("module_id").references(() => studyModule.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("quiz_userId_idx").on(t.userId)]
)

export const question = pgTable(
  "question",
  {
    id: id(),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quiz.id, { onDelete: "cascade" }),
    kind: text("kind").$type<QuestionKind>().notNull(),
    prompt: text("prompt").notNull(),
    /** MC: array of options */
    options: jsonb("options").$type<string[]>(),
    /** MC: index into options; free text: reference answer */
    correctIndex: integer("correct_index"),
    referenceAnswer: text("reference_answer"),
    explanation: text("explanation"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("question_quizId_idx").on(t.quizId)]
)

export const quizAttempt = pgTable(
  "quiz_attempt",
  {
    id: id(),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quiz.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    score: numeric("score", { precision: 5, scale: 2 }), // 0-100, null while running
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("quiz_attempt_quizId_idx").on(t.quizId),
    index("quiz_attempt_userId_idx").on(t.userId),
  ]
)

export const answerLog = pgTable(
  "answer_log",
  {
    id: id(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => quizAttempt.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => question.id, { onDelete: "cascade" }),
    answer: text("answer").notNull(),
    correct: boolean("correct"),
    feedback: text("feedback"),
  },
  (t) => [index("answer_log_attemptId_idx").on(t.attemptId)]
)

// ---- Relations -----------------------------------------------------------------

export const studyPlanRelations = relations(studyPlan, ({ one, many }) => ({
  module: one(studyModule, { fields: [studyPlan.moduleId], references: [studyModule.id] }),
  items: many(studyPlanItem),
}))

export const studyPlanItemRelations = relations(studyPlanItem, ({ one }) => ({
  plan: one(studyPlan, { fields: [studyPlanItem.planId], references: [studyPlan.id] }),
}))

export const deckRelations = relations(deck, ({ one, many }) => ({
  module: one(studyModule, { fields: [deck.moduleId], references: [studyModule.id] }),
  cards: many(flashcard),
}))

export const flashcardRelations = relations(flashcard, ({ one }) => ({
  deck: one(deck, { fields: [flashcard.deckId], references: [deck.id] }),
}))

export const quizRelations = relations(quiz, ({ one, many }) => ({
  module: one(studyModule, { fields: [quiz.moduleId], references: [studyModule.id] }),
  questions: many(question),
  attempts: many(quizAttempt),
}))

export const questionRelations = relations(question, ({ one }) => ({
  quiz: one(quiz, { fields: [question.quizId], references: [quiz.id] }),
}))

export const quizAttemptRelations = relations(quizAttempt, ({ one, many }) => ({
  quiz: one(quiz, { fields: [quizAttempt.quizId], references: [quiz.id] }),
  answers: many(answerLog),
}))

export const answerLogRelations = relations(answerLog, ({ one }) => ({
  attempt: one(quizAttempt, { fields: [answerLog.attemptId], references: [quizAttempt.id] }),
  question: one(question, { fields: [answerLog.questionId], references: [question.id] }),
}))
