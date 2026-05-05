import { AgeGroup } from '../types';

export const getAgeGroup = (age: number): AgeGroup => {
  if (age <= 12) return 'child';
  if (age <= 19) return 'teenager';
  if (age <= 59) return 'adult';
  return 'senior';
};

export const getISOUTCString = (date: Date = new Date()): string => {
  return date.toISOString();
};
