// "Learn the basics" - three interactive lessons (App\Support\BasicsLessons).
export interface BasicsLesson {
  slug: 'why' | 'find' | 'first';
  title: string;
}

export const BASICS_LESSONS: BasicsLesson[] = [
  { slug: 'why', title: 'Why Kegel training works' },
  { slug: 'find', title: 'Find your pelvic floor' },
  { slug: 'first', title: 'Your first exercise' },
];
