// "Learn the basics" - three interactive lessons (App\Support\BasicsLessons).
export interface BasicsLesson {
  slug: 'why' | 'find' | 'first';
  /** i18n key. The title is shown to the reader, so it cannot live here. */
  titleKey: string;
}

export const BASICS_LESSONS: BasicsLesson[] = [
  { slug: 'why', titleKey: 'basics.whyTitle' },
  { slug: 'find', titleKey: 'basics.findTitle' },
  { slug: 'first', titleKey: 'basics.firstTitle' },
];
