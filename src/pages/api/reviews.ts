import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { postReview, deleteReview } from '../../lib/reviews';

export const POST: APIRoute = ({ request }) => postReview(sql, request);
export const DELETE: APIRoute = ({ request }) => deleteReview(sql, request);
