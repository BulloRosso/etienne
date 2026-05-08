// Builds A2UI v0.9 surface payloads for the restaurant-booking demo.
// Surface layout follows https://a2ui.org/concepts/data-flow/#lifecycle-example-restaurant-booking

import type { A2uiMessage, ComponentNode } from './a2ui-messages.js';
import { createSurface, updateComponents, updateDataModel, deleteSurface } from './a2ui-messages.js';

export const BOOKING_SURFACE_ID = 'booking';

// Initial booking form: title, datetime picker, guests field, confirm button.
export function buildBookingFormMessages(): A2uiMessage[] {
  const components: ComponentNode[] = [
    {
      id: 'root',
      component: 'Column',
      children: ['title', 'subtitle', 'datetime', 'guests', 'footer'],
    },
    {
      id: 'title',
      component: 'Text',
      text: 'Book a table',
      variant: 'h1',
    },
    {
      id: 'subtitle',
      component: 'Text',
      text: 'Reserve a spot at our restaurant.',
      variant: 'body',
    },
    {
      id: 'datetime',
      component: 'DateTimeInput',
      label: 'When',
      value: { path: '/reservation/datetime' },
      enableDate: true,
      enableTime: true,
      checks: [
        {
          condition: {
            call: 'required',
            args: { value: { path: '/reservation/datetime' } },
            returnType: 'boolean',
          },
          message: 'Please choose a date and time.',
        },
      ],
    },
    {
      id: 'guests',
      component: 'TextField',
      label: 'Number of guests',
      value: { path: '/reservation/guests' },
      variant: 'number',
      checks: [
        {
          condition: {
            call: 'required',
            args: { value: { path: '/reservation/guests' } },
            returnType: 'boolean',
          },
          message: 'Please enter the number of guests.',
        },
      ],
    },
    {
      id: 'footer',
      component: 'Row',
      justify: 'end',
      children: ['submitBtn'],
    },
    {
      id: 'submitBtn',
      component: 'Button',
      child: 'submitLabel',
      variant: 'primary',
      action: {
        event: {
          name: 'confirm',
          context: {
            datetime: { path: '/reservation/datetime' },
            guests: { path: '/reservation/guests' },
          },
        },
      },
      checks: [
        {
          condition: {
            call: 'required',
            args: { value: { path: '/reservation/datetime' } },
            returnType: 'boolean',
          },
          message: 'Please choose a date and time.',
        },
        {
          condition: {
            call: 'required',
            args: { value: { path: '/reservation/guests' } },
            returnType: 'boolean',
          },
          message: 'Please enter the number of guests.',
        },
      ],
    },
    {
      id: 'submitLabel',
      component: 'Text',
      text: 'Confirm booking',
    },
  ];

  return [
    createSurface(BOOKING_SURFACE_ID),
    updateComponents(BOOKING_SURFACE_ID, components),
    updateDataModel(BOOKING_SURFACE_ID, '/reservation/datetime', ''),
    updateDataModel(BOOKING_SURFACE_ID, '/reservation/guests', ''),
  ];
}

// Confirmation surface: replaces the form with a "You booked a table!" panel.
export function buildConfirmationMessages(datetime: string, guests: string): A2uiMessage[] {
  const prettyWhen = formatDateTime(datetime);
  const guestsLabel = guests ? (guests === '1' ? '1 guest' : `${guests} guests`) : 'an unspecified party';
  const components: ComponentNode[] = [
    {
      id: 'root',
      component: 'Column',
      children: ['done', 'detail'],
    },
    {
      id: 'done',
      component: 'Text',
      text: 'You booked a table!',
      variant: 'h1',
    },
    {
      id: 'detail',
      component: 'Text',
      text: `Reserved for ${guestsLabel} on ${prettyWhen}.`,
      variant: 'body',
    },
  ];
  return [updateComponents(BOOKING_SURFACE_ID, components)];
}

export function buildDeleteMessages(): A2uiMessage[] {
  return [deleteSurface(BOOKING_SURFACE_ID)];
}

function formatDateTime(iso: string): string {
  if (!iso) return 'an unspecified time';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
