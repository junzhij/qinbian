/** Resource snapshots are JSON data; serializing also removes nested Vue proxies. */
export function cloneSnapshot<T>(value:T):T {
 return JSON.parse(JSON.stringify(value)) as T
}
