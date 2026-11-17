// First-load failure of a section: the shared error shell and the helpers that decide when to show it.
export { LoadFailure, type LoadFailureProps, type LoadFailureQuery } from './load-failure';
export { isLoadFailed, isWaitingForNetwork, loadFailureOf, type LoadQueryState } from './load-state';
