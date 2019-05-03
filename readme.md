
```typescript
import { Batcher, BatchResult } from '@viva-eng/batcher';

interface Result {
	id: number;
	name: string;
	age: number;
}

class MyBatcher extends Batcher<number, void, Result> {
	async _makeRequest(requests) {
		const results: BatchResult<Result> = { };
		const requestedIds = requests.map(x => x.params);
		const resultFromSomewhere: Result[] = await getResultFromSomewhere(requestedIds);

		resultFromSomewhere.forEach((result) => {
			results[result.id] = result;
		});

		return results;
	}
}

// Create a new instance of our batcher with a max size of 10 and a
// max wait time of 10ms
const myBatcher = new MyBatcher(10, 10);

// Although we make 3 separate calls to the batcher, these all go in one request
const [ bob, sara, joe ] = await Promise.all([
	myBatcher.request(1),
	myBatcher.request(2),
	myBatcher.request(3)
]);

const userPromises = [ ];

// This will be broken up into 3 batches due to the max batch size
for (let i = 1; i <= 30; i++) {
	userPromises.push(myBatcher.request(i));
}

const users = await Promise.all(userPromises);
```
