import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LessonLine } from '../../../components/LessonLine';

interface Props {
  step: number;
  onFinished: () => void;
}

/**
 * Why train: what the muscle is, and what doing it wrong costs.
 *
 * Every line here already shipped in all 29 locales before this rewrite. That
 * is the constraint the redesign was held to: cutting the lessons down to one
 * sentence a step meant choosing which existing sentences survive, never
 * writing new English for 28 other languages to catch up with later.
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
