import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LessonLine } from '../../../components/LessonLine';

interface Props {
  step: number;
  onFinished: () => void;
}

/**
 * Where the muscles are: how to locate them, how to isolate them, and the one
 * safety rule that has to survive any amount of trimming - the pee test finds
 * the muscles, it is not an exercise, and repeating it is bad for the bladder.
 */
const LINES = [
  'find.stopTheFlowBody',
  'find.squeezeOnlyThoseMusclesDesc',
  'find.onlyDoThePeeTestDesc',
];

export const FindLesson: React.FC<Props> = ({ step, onFinished }) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (step === LINES.length - 1) {
      onFinished();
    }
  }, [step, onFinished]);

  return <LessonLine step={step} text={t(LINES[step] ?? LINES[0])} />;
};
