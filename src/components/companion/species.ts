import type { CompanionKind } from '../../lib/types'

export interface Species {
  name: string
  fill: string
  light: string
  accent: string
  cheek: string
  belly?: string
  face?: string
  extraCircles?: [number, number, number][]
  extraPaths?: string[]
}

export const SPECIES: Record<CompanionKind, Species> = {
  bunny: { name: 'Mochi the bunny', fill: '#fbf1e8', light: '#fffdf9', accent: '#f6bfc6', cheek: '#f4a3ab' },
  bear: {
    name: 'Biscuit the bear',
    fill: '#e3bb95',
    light: '#f1d3b4',
    accent: '#f6dfc8',
    cheek: '#ee9f93',
    extraCircles: [
      [68, 88, 14],
      [132, 88, 14],
    ],
  },
  cat: {
    name: 'Pudding the cat',
    fill: '#f5dcc7',
    light: '#fff1e4',
    accent: '#e9b48f',
    cheek: '#f3a0a4',
    extraPaths: ['M60 100 L66 70 L90 86 Z', 'M140 100 L134 70 L110 86 Z'],
  },
  penguin: { name: 'Pebble the penguin', fill: '#5f6a8c', light: '#7e89ab', accent: '#f2b36b', cheek: '#f3a0a8', face: '#fffaf3' },
  moon: { name: 'Luna the little moon', fill: '#f7e19b', light: '#fff4c9', accent: '#eed083', cheek: '#f3a58f' },
  cloud: {
    name: 'Puff the cloud',
    fill: '#f4f3fb',
    light: '#ffffff',
    accent: '#dcd9ee',
    cheek: '#f2a8b3',
    extraCircles: [
      [70, 102, 24],
      [100, 86, 28],
      [131, 100, 24],
      [52, 138, 18],
      [148, 138, 18],
    ],
  },
}

export const COMPANION_KINDS = Object.keys(SPECIES) as CompanionKind[]
