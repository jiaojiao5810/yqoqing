
import { Octokit } from "octokit";

export function getOctokit() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Missing GITHUB_TOKEN");
  return new Octokit({ auth: token });
}

export function getOrg() {
  const org = process.env.GITHUB_ORG;
  if (!org) throw new Error("Missing GITHUB_ORG");
  return org;
}
