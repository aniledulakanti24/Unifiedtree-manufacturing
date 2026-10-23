import { PROCESSES as DEFAULT_PROCESSES } from './seed';

// Machine processes (work centres) – cutting, welding, packing… The factory edits them on Setup → Processes.
// A removed process keeps its name (old time logs and job work still show it) but is no longer offered.

export let PROCESSES = DEFAULT_PROCESSES;

export function setProcesses(map) {
  PROCESSES = map ?? DEFAULT_PROCESSES;
}

/** [key, process] pairs still in use, in order. */
export const activeProcesses = () => Object.entries(PROCESSES).filter(([, p]) => !p.removed);
