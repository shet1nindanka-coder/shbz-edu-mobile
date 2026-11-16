// Mobile-only strings of the student's homework and live-lesson screens (homework list, homework detail with
// photos and the AI check, the «Урок» tab). Site texts stay in `dict.student.*`; the study screens (overview,
// theory, number, deadlines, info) keep their mobile strings in `./student.ts`.
const ru = {
  photos: {
    takePhoto: "Сделать фото",
    chooseFromLibrary: "Выбрать из галереи"
  }
};

const en: typeof ru = {
  photos: {
    takePhoto: "Take a photo",
    chooseFromLibrary: "Choose from library"
  }
};

export const studentWork = { ru, en };
