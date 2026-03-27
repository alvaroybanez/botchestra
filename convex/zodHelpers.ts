import { NoOp } from "convex-helpers/server/customFunctions";
import {
  zid as convexZid,
  zCustomAction,
  zCustomMutation,
  zCustomQuery,
} from "convex-helpers/server/zod";

import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

export const zAction = zCustomAction(action, NoOp);
export const zMutation = zCustomMutation(mutation, NoOp);
export const zQuery = zCustomQuery(query, NoOp);
export const zInternalAction = zCustomAction(internalAction, NoOp);
export const zInternalMutation = zCustomMutation(internalMutation, NoOp);
export const zInternalQuery = zCustomQuery(internalQuery, NoOp);
export const zid = convexZid;
