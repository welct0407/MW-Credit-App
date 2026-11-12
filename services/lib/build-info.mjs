// R144 component versioning: the release (Rnnn) and source commit this image was built for. The Dockerfile sets
// MW_RELEASE_NUMBER and MW_SOURCE_COMMIT from Cloud Build substitutions; anything missing or malformed reads as dev/unknown,
// so /health never echoes an arbitrary environment value.
const RELEASE=/^(?:R\d{3}|dev)$/,COMMIT=/^[0-9a-f]{7,40}$/;
/** @param {Record<string,string|undefined>} [env] @returns {{release:string,commit:string}} */
export function buildInfo(env=process.env){
 const release=env.MW_RELEASE_NUMBER,commit=env.MW_SOURCE_COMMIT;
 return Object.freeze({release:typeof release==='string'&&RELEASE.test(release)?release:'dev',commit:typeof commit==='string'&&COMMIT.test(commit)?commit:'unknown'});
}
