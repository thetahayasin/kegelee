import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LessonLine } from '../../../components/LessonLine';

interface Props {
  step: number;
  onFinished: () => void;
}

/**
 * How a session runs: the circle leads, you squeeze and release with it.
 *
 * The live Trembling demo that used to sit here is gone. It ran its own timer
 * loop and glow animation to rehearse a circle the reader meets for real one
 * screen later, which is a lot of moving parts to say "follow the circle".
 */
const LINES = [
  'first.followTheCircle',
  'first.yourFirstExerciseQuickFlicks',
  'first.thatWasARealExercise',
];

export const FirstLesson: React.FC<Props> = ({ step, onFinished }) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (step === LINES.length - 1) {
      onFinished();
    }
  }, [step, onFinished]);

  return <LessonLine step={step} text={t(LINES[step] ?? LINES[0])} />;
};
