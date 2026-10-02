import { EVENT_TYPES } from './constants.js';
import { nowLocalISO, todayISO } from './format.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_RE = /^([^\s@]+@[^\s@]+\.[^\s@]+|\+?[\d\s\-()]{7,20})$/;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function validateLogin({ email, password }) {
  const errors = {};
  if (!email.trim()) errors.email = 'Email is required';
  else if (!EMAIL_RE.test(email.trim())) errors.email = 'Enter a valid email address';
  if (!password) errors.password = 'Password is required';
  return errors;
}

export function validateRegister({ name, email, password, confirmPassword, role }) {
  const errors = validateLogin({ email, password });
  if (name.trim().length < 2) errors.name = 'Name must be at least 2 characters';
  if (!role) errors.role = 'Choose how you will use EventFlow';

  if (password) {
    if (password.length < 8) errors.password = 'Password must be at least 8 characters';
    else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      errors.password = 'Password must contain a letter and a number';
    }
  }
  if (!confirmPassword) errors.confirmPassword = 'Confirm your password';
  else if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match';
  return errors;
}

export function validateImage(file) {
  if (!file) return undefined;
  if (!IMAGE_TYPES.includes(file.type)) return 'Banner must be a JPG, PNG, WEBP or GIF image';
  if (file.size > MAX_IMAGE_BYTES) return 'Banner must be smaller than 5 MB';
  return undefined;
}

export function validateEvent(v, image) {
  const errors = {};
  const need = (key, label) => {
    if (!String(v[key] ?? '').trim()) errors[key] = `${label} is required`;
    return !errors[key];
  };

  if (need('name', 'Event name') && v.name.trim().length < 3) errors.name = 'Event name must be at least 3 characters';
  if (need('description', 'Description') && v.description.trim().length < 10) {
    errors.description = 'Description must be at least 10 characters';
  }
  if (!EVENT_TYPES.includes(v.type)) errors.type = 'Select an event type';
  need('venue', 'Venue');
  if (need('organizerName', 'Organizer name') && v.organizerName.trim().length < 2) {
    errors.organizerName = 'Organizer name must be at least 2 characters';
  }
  if (need('organizerContact', 'Organizer contact') && !CONTACT_RE.test(v.organizerContact.trim())) {
    errors.organizerContact = 'Enter a valid email address or phone number';
  }

  if (need('date', 'Date') && v.date < todayISO()) errors.date = 'Event date cannot be in the past';
  need('startTime', 'Start time');
  need('endTime', 'End time');
  if (v.startTime && v.endTime && v.endTime <= v.startTime) errors.endTime = 'End time must be after the start time';

  const max = Number(v.maxParticipants);
  if (need('maxParticipants', 'Maximum participants')) {
    if (!Number.isInteger(max) || max < 1) errors.maxParticipants = 'Enter a whole number of at least 1';
    else if (max > 100000) errors.maxParticipants = 'Maximum participants must be at most 100000';
  }

  if (need('registrationDeadline', 'Registration deadline')) {
    if (v.registrationDeadline < nowLocalISO()) {
      errors.registrationDeadline = 'Registration deadline cannot be in the past';
    } else if (v.date && v.startTime && v.registrationDeadline > `${v.date}T${v.startTime}`) {
      errors.registrationDeadline = 'Registration deadline must be on or before the event start';
    }
  }

  const imageError = validateImage(image);
  if (imageError) errors.image = imageError;
  return errors;
}
