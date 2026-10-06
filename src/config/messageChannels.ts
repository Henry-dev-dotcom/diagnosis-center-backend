import { MessageChannel, UserRole } from '@prisma/client';

/*
  Who can talk where.

  One channel for everybody and one per department, because that is how a
  hospital already works: some things concern the whole building and most things
  concern one bench. A department's channel is for the people in it, and an
  administrator sees all of them - somebody has to be able to answer.

  Roles are listed per channel rather than derived from a name, because the
  mapping is not one-to-one: a nurse belongs with the clinical team, reception
  has its own, and the pharmacy is on its own again.
*/
export type MessageChannelDefinition = {
  key: MessageChannel;
  /** What it is called in the sidebar. */
  name: string;
  /** One line under the name, so nobody has to guess what belongs where. */
  description: string;
  /** The roles whose own channel this is. Administrators reach every channel. */
  roles: readonly UserRole[];
  sortOrder: number;
};

export const MESSAGE_CHANNELS: readonly MessageChannelDefinition[] = [
  {
    key: MessageChannel.ALL,
    name: 'All departments',
    description: 'Anything the whole building needs to know.',
    roles: [
      UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTIONIST,
      UserRole.LAB_STAFF, UserRole.SCAN_STAFF, UserRole.BILLING_STAFF, UserRole.PHARMACIST
    ],
    sortOrder: 1
  },
  {
    key: MessageChannel.CLINICAL,
    name: 'Clinicians',
    description: 'Doctors and nurses on the wards and in clinic.',
    roles: [UserRole.DOCTOR, UserRole.NURSE],
    sortOrder: 2
  },
  {
    key: MessageChannel.LABORATORY,
    name: 'Laboratory',
    description: 'The bench: samples, analyzers, reagents.',
    roles: [UserRole.LAB_STAFF],
    sortOrder: 3
  },
  {
    key: MessageChannel.IMAGING,
    name: 'Scan / Imaging',
    description: 'The imaging unit: machines, bookings, reporting.',
    roles: [UserRole.SCAN_STAFF],
    sortOrder: 4
  },
  {
    key: MessageChannel.PHARMACY,
    name: 'Pharmacy',
    description: 'Dispensing and stock.',
    roles: [UserRole.PHARMACIST],
    sortOrder: 5
  },
  {
    key: MessageChannel.FRONT_OFFICE,
    name: 'Front office',
    description: 'Reception and the records desk.',
    roles: [UserRole.RECEPTIONIST],
    sortOrder: 6
  },
  {
    key: MessageChannel.FINANCE,
    name: 'Finance',
    description: 'The cashier window and the books.',
    roles: [UserRole.BILLING_STAFF],
    sortOrder: 7
  }
];

/** How long a message lives. Changing this changes only new messages. */
export const MESSAGE_TTL_HOURS = 24;

export function canUseChannel(channel: MessageChannel, role: UserRole) {
  if (role === UserRole.ADMIN) return true;
  const definition = MESSAGE_CHANNELS.find((entry) => entry.key === channel);
  return Boolean(definition?.roles.includes(role));
}

/** The channels this role can open, in the order they are shown. */
export function channelsForRole(role: UserRole) {
  return MESSAGE_CHANNELS
    .filter((entry) => canUseChannel(entry.key, role))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
