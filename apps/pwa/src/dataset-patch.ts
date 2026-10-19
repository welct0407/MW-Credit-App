/** The PWA's view of the shared offline dataset logic (services/lib/offline-dataset-digest.mjs, also used by the
 * server's reconciliation): patch application, the moved-row check and the reconciliation digest. */
export {codePointCompare,applyDatasetPatch,deltaMovesRows,deltaScopeMoves,canonicalDatasetValue,datasetDigests,digestDifferences} from '../../../services/lib/offline-dataset-digest.mjs';
export type {DatasetDigests} from '../../../services/lib/offline-dataset-digest.mjs';
