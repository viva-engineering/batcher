
import { defer, Deferred } from './defer';

interface BatchDict<Params, Vars, Result> {
	[batchKey: string]: Batch<Params, Vars, Result>;
}

interface BatchRunner<Params, Vars, Result> {
	(requests: RequestWrapper<Params>[], variables: Vars): Promise<Map<Params, Result>>;
}

export interface RequestWrapper<Params> {
	key: string | number;
	params: Params;
}

export interface BatchResult<Result> {
	[requestKey: string]: Result;
}

/**
 * Defines a new batched request process
 *
 * @template Params The parameter type for individual requests
 * @template Vars The variables used to break down batches into compatible groups
 * @template Result The result for a single requested item
 */
export abstract class Batcher<Params, Vars, Result> {
	/**
	 * The dictionary active batches being built
	 */
	protected readonly _batches: BatchDict<Params, Vars, Result> = { };

	/**
 	 * @param maxSize The maximum number of requests that will go into a single batch
 	 * @param maxWait The maximum amount of time (in ms) to wait before running a batch
	 */
	constructor(
		protected readonly _maxSize: number,
		protected readonly _maxWait: number
	) { }

	/**
	 * Determines the batch key used for breaking up requests into separate batches. If not
	 * overridden by the child class, this defaults to always returning an empty string (meaning
	 * any request can be batched with any other request).
	 *
	 * @param variables The variables for the request being assigned
	 */
	protected _getBatchKey(variables: Vars) : string | number {
		return '';
	}

	/**
	 * Determines the request key used for de-duplicating concurrent requests. If no overriden
	 * by the child class, this defaults to just returning `String(params)`.
	 *
	 * @param params The request to generate a key for
	 */
	protected _getRequestKey(params: Params) : string | number {
		return String(params);
	}

	/**
	 * Actually makes a request for a fully formed batch
	 *
	 * @param requests An array of all the requests in this batch
	 * @param variables The variables assigned for this batch
	 */
	protected abstract _makeRequest(requests: RequestWrapper<Params>[], variables: Vars) : Promise<Map<Params, Result>>;

	/**
	 * Adds a request to be run in the next available batch. Resolves with the final result
	 * for this request once the batch runs
	 *
	 * @param request The request to be made
	 * @param variables Any variables to use in the batch
	 */
	public request(request: Params, variables: Vars) : Promise<Result> {
		const batchKey = this._getBatchKey(variables);
		const requestKey = this._getRequestKey(request);

		if (! this._batches[batchKey] || this._batches[batchKey].isClosed) {
			const runBatch = (requests: RequestWrapper<Params>[], variables: Vars) => {
				return this._makeRequest(requests, variables);
			};

			// TODO: Using `variables` directly like this is not strictly safe as it could
			// be mutated by outside code after we already generated a batch key off of it
			this._batches[batchKey] = new Batch(this._maxSize, this._maxWait, variables, runBatch);
		}

		return this._batches[batchKey].request(requestKey, request);
	}
}

class Batch<Params, Vars, Result> {
	protected _timeout: number;
	protected _requests: RequestWrapper<Params>[] = new Array(this._maxSize);
	protected _nextIndex: number = 0;
	protected _deferreds: {
		[requestKey: string]: Deferred<Result>
	}
	
	/** Is set to true once the batch starts processing to prevent new items from being added */
	public isClosed: boolean = false;

	constructor(
		protected readonly _maxSize: number,
		protected readonly _maxWait: number,
		protected _variables: Vars,
		protected _runBatch: BatchRunner<Params, Vars, Result>
	) {
		this._timeout = setTimeout(() => this._run(), _maxWait);
	}

	protected async _run() {
		if (this.isClosed) {
			return;
		}

		// Cancel the timeout in case it hasn't fired yet
		clearTimeout(this._timeout);

		// Close the batch to prevent anything else from happening here
		this.isClosed = true;

		const count = this._nextIndex;

		// If the batch was never filled, slice out only the indexes that actually have items
		const requests = count >= this._maxSize
			? this._requests
			: this._requests.slice(0, count);

		try {
			// Actually run the batch operation
			const results = await this._runBatch(requests, this._variables);

			// Resolve all of the waiting deferreds with their results
			for (let i = 0; i < count; i++) {
				const key = requests[i].key;

				this._deferreds[key].resolve(results[key]);
			}
		}

		// In the case of an error, reject all of the waiting deferreds
		catch (error) {
			for (let i = 0; i < count; i++) {
				this._deferreds[requests[i].key].reject(error);
			}
		}

		// Cleanup the batch object to ease garbage collection now that we're done
		this._cleanup();
	}

	request(key: string | number, params: Params) : Promise<Result> {
		// If there is already an item in this batch that matches the key, reuse the promise
		if (this._deferreds[key]) {
			return this._deferreds[key].promise;
		}

		const deferred: Deferred<Result> = defer();

		// Add the new request to the batch
		this._requests[this._nextIndex++] = { key, params };

		// Add the new deferred to the waiting list
		this._deferreds[key] = deferred;

		// If this request pushed us to the max size, run the batch now
		if (this._nextIndex >= this._maxSize) {
			this._run();
		}

		return deferred.promise;
	}

	protected _cleanup() {
		this._timeout = null;
		this._requests = null;
		this._nextIndex = null;
		this._deferreds = null;
		this._variables = null;
		this._runBatch = null;
	}
}
