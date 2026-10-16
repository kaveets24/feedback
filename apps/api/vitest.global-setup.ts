import { prepareTestDatabase } from '@feedback/db/testing';
import { prepareTestBucket } from '@feedback/storage/testing';

export default async () => {
  await prepareTestDatabase('api');
  await prepareTestBucket('api');
};
