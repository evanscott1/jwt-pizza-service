# Security Refactoring: Transition to AWS Secrets Manager

## Executive Summary
This document outlines the successful transition of the `jwt-pizza-service` pipeline from a build-time secrets injection model to a secure, runtime-injection model using AWS Secrets Manager. This change eliminates the risk of exposing sensitive credentials in Docker images and CI artifacts, aligning the project with industry-standard DevSecOps practices.

---

## 1. The Legacy Approach: Build-Time Secrets (Security Risks)

Previously, the GitHub Actions workflow used `sed` commands to write database passwords and API keys directly into a `config.js` file before building the Docker image.

### Why this was a critical risk:
* **Baked-in Secrets:** When `docker build` ran, the `config.js` file containing plain-text passwords was copied into the image's file system.
    * *Risk:* Any user or service with permission to pull the image from ECR could inspect the file system and steal production credentials.
* **Secrets in CI Artifacts:** The workflow uploaded the `dist/` folder as a build artifact.
    * *Risk:* GitHub Actions artifacts act like zip files. Anyone with read access to the repository logs could download the artifact and view the `config.js` file.
* **Immutable Security Flaw:** Rotating a compromised password required a full rebuild and redeploy of the application code, as the secret was tightly coupled to the image version.

---

## 2. Core Security Principles

The new architecture adheres to three foundational DevOps security principles:

1.  **Strict Separation of Config and Code (The 12-Factor App):** Code remains consistent across environments (Dev, Test, Prod), while configuration varies. By removing secrets from the image, the Docker artifact becomes "environment-agnostic."
2.  **Runtime Injection:** Secrets exist only in the application's memory while running. They do not exist on the disk or in the file system.
3.  **Principle of Least Privilege:** Only the specific entity that requires the secrets (the ECS Task) is granted permission to access them, and only for the specific resources needed.

---

## 3. The New Architecture: Runtime Injection via AWS

In the new model, the application code and Docker image are "dumb"—they are aware they require configuration but do not possess the values until startup.

### How it works:
1.  **Storage:** Secrets are centrally stored and encrypted in **AWS Secrets Manager**.
2.  **Authentication:** The ECS Service uses a **Task Execution Role** (IAM Identity) with a specific policy allowing it to read only the required secret.
3.  **Injection:** Upon container startup, the ECS Agent assumes the execution role, fetches the secrets from AWS, and injects them as environment variables (e.g., `DB_PASSWORD`).
4.  **Usage:** The Node.js application reads values via `process.env`, remaining unaware of the underlying injection mechanism.

---

## 4. Transition Implementation Steps

### Phase 1: Application & CI Refactoring
* **Refactored `config.js`:** Updated the application configuration to utilize `process.env` variables instead of hardcoded strings.
* **Separated Test vs. Prod Configs:** Modified the GitHub Actions workflow to:
    1.  Generate a temporary, disposable config for the `npm test` step.
    2.  **Overwrite** that file with a secure, production-ready config (referencing `process.env`) before building the final artifact.
* **Sanitized Pipeline:** Removed insecure `sed` commands. The resulting build artifact and Docker image now contain zero secrets.

### Phase 2: AWS Infrastructure Setup
* **Secret Creation:** Stored key-value pairs (DB host, username, password, API keys) in AWS Secrets Manager.
* **IAM Configuration:** Added a strict **Inline Policy** to the `jwt-pizza-ecs` Task Execution Role, granting `secretsmanager:GetSecretValue` permission specifically for the production secret ARN.
* **Service Linked Role Fix:** Troubleshooted and recreated the `AWSServiceRoleForECS` to resolve cluster creation failures.

### Phase 3: Deployment & Connection
* **Task Definition Update:** Created a new Task Definition revision using the **`ValueFrom`** syntax to map environment variables to the Secret ARN.
* **Forced Deployment:** Updated the ECS Service with `--force-new-deployment`, triggering new tasks to spin up, authenticate via IAM, and successfully connect to the RDS database.

---

## 5. Final Outcome

The pipeline is now fully Cloud-Native and Secure:

* **GitHub:** Zero secrets in code, logs, or artifacts.
* **Docker/ECR:** Image is safe to scan or pull; it contains no sensitive data.
* **AWS:** Secrets are centralized, encrypted, and rotatable without code rebuilds.
* **Access Control:** Access is strictly governed via IAM roles.