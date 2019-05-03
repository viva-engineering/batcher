
export interface Deferred<T> {
	resolve(result: T | PromiseLike<T>) : void;
	reject(reason: any) : void;
	promise: Promise<T>;
}

export const defer = <T>() : Deferred<T> => {
	const deferred = { } as Deferred<T>;

	deferred.promise = new Promise((resolve, reject) => {
		deferred.resolve = resolve;
		deferred.reject = reject;
	});

	return deferred;
};
