/** Lower-case RFC 4122 version-4 identifier. */
export const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** The same shape, accepting upper-case hex (routes lower-case it afterwards). */
export const UUID_V4_ANY_CASE=new RegExp(UUID_V4.source,'i');
/** Any lower-case 8-4-4-4-12 identifier (database-generated ids of any version). */
export const UUID_ANY=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const isUuidV4=value=>typeof value==='string'&&UUID_V4.test(value);
export const isUuidAny=value=>typeof value==='string'&&UUID_ANY.test(value);
