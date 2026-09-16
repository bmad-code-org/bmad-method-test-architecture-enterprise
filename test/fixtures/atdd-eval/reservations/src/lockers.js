'use strict';

/**
 * The locker inventory for the quay pick-up points.
 *
 * Three lockers, held in memory for the lifetime of the process. Each carries the
 * fields the lookup endpoint reports: an id, where it stands on the quay, and the
 * parcel size it takes.
 */
const LOCKERS = [
  { id: 'L-104', location: 'Pier 4, bay 1', size: 'medium' },
  { id: 'L-217', location: 'Pier 2, bay 7', size: 'large' },
  { id: 'L-330', location: 'Ferry hall, wall 3', size: 'small' },
];

const byId = new Map(LOCKERS.map((locker) => [locker.id, locker]));

/** Every locker, in inventory order. */
function listLockers() {
  return LOCKERS.map((locker) => ({ ...locker }));
}

/**
 * One locker by id, or null when the id is not in the inventory.
 *
 * @param {string} id
 * @returns {{id: string, location: string, size: string}|null}
 */
function findLocker(id) {
  const locker = byId.get(id);
  return locker ? { ...locker } : null;
}

module.exports = { listLockers, findLocker };
