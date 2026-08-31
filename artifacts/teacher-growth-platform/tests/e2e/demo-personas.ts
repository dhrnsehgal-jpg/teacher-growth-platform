import { DEMO_PASSWORD, findPersona, type DemoPersona } from '../../src/lib/demo-access';

export { DEMO_PASSWORD };

type DemoPersonaKey = DemoPersona['key'];

function requiredDemoEmail(key: DemoPersonaKey): string {
  const persona = findPersona(key);

  if (!persona) {
    throw new Error(`Missing required demo persona: ${key}`);
  }

  return persona.email;
}

export const NEHA = requiredDemoEmail('neha');
export const VIKRAM = requiredDemoEmail('vikram');
export const ANJALI = requiredDemoEmail('anjali');
export const VICE_PRINCIPAL = requiredDemoEmail('vice-principal');
export const ACADEMIC_COORDINATOR = requiredDemoEmail('academic-coordinator');
export const PRINCIPAL = requiredDemoEmail('principal');
export const PRIYA = requiredDemoEmail('priya');
export const HARPREET = requiredDemoEmail('harpreet');

// Rajesh is a seeded member of the larger synthetic cohort, deliberately not
// part of the password-free chooser roster. Keep his one scenario login
// centralized here rather than repeating the seed-only address in a spec.
export const RAJESH = 'rajesh.verma@demo-school.example';
