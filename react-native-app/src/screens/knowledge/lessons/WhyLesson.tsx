import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LessonLine } from '../../../components/LessonLine';

interface Props {
  step: number;
  onFinished: () => void;
}

/**
 * Why train: what the muscle is, what doing it wrong costs, what comes next.
 *
 * Pure text, one line a step. Nothing here is worth demonstrating - the whole
 * lesson is an argument, and an argument reads. The lessons that DO have
 * something to show you (finding the muscles, following the circle) keep their
 * hands-on steps; this one never needed one.
 *
 * Every line already shipped in all 29 locales. Cutting to one sentence a step
 * meant choosing which existing sentences survive, never writing new English
 * for 28 other languages to catch up with.
 */
const LINES = [
  'why.cardRealMuscle',
  'why.squeezeTheWrongMusclesAnd',
  'why.theNextLessonShowsYou',
];

export const WhyLesson: React.FC<Props> = ({ step, onFinished }) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (step === LINES.length - 1) {
      onFinished();
    }
  }, [step, onFinished]);

  return <LessonLine step={step} text={t(LINES[step] ?? LINES[0])} />;
};
