export type Lang = "uz" | "ru" | "en";

export const LANG_KEY = "mathcoach.lang";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "uz", label: "O'zbekcha" },
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
];

export const UI = {
  uz: {
    heading: "Matematika masalasida qotib qoldingizmi?",
    subheading: "Keling, nima qiyinchilik tug'dirayotganini aniqlaymiz.",
    placeholder: "Masalangizni bu yerga yozing yoki joylashtiring…",
    startBtn: "Boshlash",
    exampleLabel: "Yoki namuna tanlang:",
    coachTitle: "Matematika murabbiyi",
    newProblem: "Yangi masala",
    chatPlaceholder: "Javobingizni yoki keyingi fikringizni yozing…",
    sendBtn: "Yuborish",
    errorSuffix: "Qayta urinib ko'ring.",
    loading: "Yuklanmoqda…",
    examples: [
      {
        label: "Kasrlar",
        problem:
          "2/3 + 1/4 ni qanday hisoblayman? Kasrlar bilan doim chalkashib ketaman.",
      },
      {
        label: "Algebra",
        problem:
          "3(x − 2) = 4x + 5 tenglamasida x ni toping. Qayerdan boshlashni bilmayman.",
      },
      {
        label: "Hisob",
        problem:
          "f(x) = x² · sin(x) funksiyasining hosilasini toping. Qaysi qoidani qo'llashni bilmayman.",
      },
    ],
  },
  ru: {
    heading: "Застряли на математической задаче?",
    subheading: "Давайте разберёмся, что именно вас останавливает.",
    placeholder: "Вставьте или напишите вашу задачу здесь…",
    startBtn: "Начать",
    exampleLabel: "Или выберите пример:",
    coachTitle: "Репетитор по математике",
    newProblem: "Новая задача",
    chatPlaceholder: "Напишите ваш ответ или следующую мысль…",
    sendBtn: "Отправить",
    errorSuffix: "Попробуйте ещё раз.",
    loading: "Загрузка…",
    examples: [
      {
        label: "Дроби",
        problem:
          "Как вычислить 2/3 + 1/4? Я всё время путаюсь с дробями.",
      },
      {
        label: "Алгебра",
        problem:
          "Решите уравнение 3(x − 2) = 4x + 5. Не знаю, с чего начать.",
      },
      {
        label: "Матанализ",
        problem:
          "Найдите производную f(x) = x² · sin(x). Не уверен, какое правило применить.",
      },
    ],
  },
  en: {
    heading: "Stuck on a math problem?",
    subheading: "Let's find what's really tripping you up.",
    placeholder: "Paste or type your problem here…",
    startBtn: "Start coaching",
    exampleLabel: "Or try an example:",
    coachTitle: "Math Coach",
    newProblem: "New problem",
    chatPlaceholder: "Type your answer or next thought…",
    sendBtn: "Send",
    errorSuffix: "Try sending your message again.",
    loading: "Loading…",
    examples: [
      {
        label: "Fractions",
        problem:
          "What is 2/3 + 1/4? I keep getting confused with fractions.",
      },
      {
        label: "Algebra",
        problem:
          "Solve for x: 3(x − 2) = 4x + 5. I don't know where to start.",
      },
      {
        label: "Calculus",
        problem:
          "Find the derivative of f(x) = x² · sin(x). I'm not sure which rule to use.",
      },
    ],
  },
} satisfies Record<Lang, {
  heading: string;
  subheading: string;
  placeholder: string;
  startBtn: string;
  exampleLabel: string;
  coachTitle: string;
  newProblem: string;
  chatPlaceholder: string;
  sendBtn: string;
  errorSuffix: string;
  loading: string;
  examples: { label: string; problem: string }[];
}>;
