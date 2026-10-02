'use strict';
const win = process.platform === 'win32' ? require('./windows') : [];
const mac = process.platform === 'darwin' ? require('./macos') : [];
const linux = process.platform === 'linux' ? require('./linux') : [];

const PLAN_ORDER = ['free', 'plus', 'pro', 'ultra', 'lifetime'];

const CATEGORIES = [
  { id: 'fps', name: 'More FPS', icon: 'gauge' },
  { id: 'cpu', name: 'CPU & RAM', icon: 'cpu' },
  { id: 'gpu', name: 'GPU profiles', icon: 'rocket' },
  { id: 'picture', name: 'Picture quality', icon: 'image' },
  { id: 'network', name: 'Internet & ping', icon: 'wifi' },
  { id: 'stability', name: 'Crash & stutter fixes', icon: 'shield' },
];

const TWEAKS = [...win, ...mac, ...linux];

module.exports = { TWEAKS, CATEGORIES, PLAN_ORDER };
