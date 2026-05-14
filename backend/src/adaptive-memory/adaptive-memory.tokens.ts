/**
 * NestJS DI tokens for adapter interfaces.
 *
 * Adapter implementations (real or fake) are bound to these tokens in the
 * AdaptiveMemoryModule. The Picker/Packer/Agent inject by token, not by
 * concrete class, so wiring fakes in tests is just a matter of providing
 * the same tokens with different implementations.
 *
 * One important DI design constraint: there is NO `PERSONALITY_STORE` token.
 * The Picker structurally must not depend on PersonalityStore (firewall
 * point 4). The Ponderer talks to PersonalityStore directly by its concrete
 * NestJS-injected class — no token, no abstraction layer that could be
 * accidentally wired into the Picker.
 */

export const WIKI_ADAPTER = Symbol('WikiAdapter');
export const KG_ADAPTER = Symbol('KGAdapter');
export const RAG_ADAPTER = Symbol('RAGAdapter');
export const SOR_ADAPTER = Symbol('SORAdapter');
export const PREFERENCES_ADAPTER = Symbol('PreferencesAdapter');
