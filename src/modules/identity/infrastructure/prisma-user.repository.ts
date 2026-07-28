import "server-only";
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { EmailAddress } from "../domain/value-objects/email-address";
import { User, type UserProps } from "../domain/entities/user";
import type {
  CreateUserInput,
  EmailAlreadyInUseFailure,
  UserRepository,
} from "../application/ports/user-repository";

type PrismaUserRow = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  role: "USER" | "ADMIN" | "MODERATOR";
  status: "ACTIVE" | "SUSPENDED" | "PENDING_VERIFICATION";
  ageConfirmedAt: Date | null;
  tosAcceptedAt: Date | null;
  privacyAcceptedAt: Date | null;
  contentPolicyAcceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Concrete Prisma-backed UserRepository. Every method reconstructs domain
 * entities from DB rows so callers work with `User` / `EmailAddress` — not raw
 * Prisma models.
 */
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByEmail(email: EmailAddress): Promise<User | null> {
    const row = await this.db.user.findUnique({ where: { email: email.value } });
    return row ? mapToDomain(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.db.user.findUnique({ where: { id } });
    return row ? mapToDomain(row) : null;
  }

  async create(
    input: CreateUserInput,
  ): Promise<User | EmailAlreadyInUseFailure> {
    try {
      const row = await this.db.user.create({
        data: {
          id: input.id,
          email: input.email.value,
          name: input.name,
          passwordHash: input.passwordHash,
          ageConfirmedAt: input.compliance.ageConfirmedAt,
          tosAcceptedAt: input.compliance.tosAcceptedAt,
          privacyAcceptedAt: input.compliance.privacyAcceptedAt,
          contentPolicyAcceptedAt: input.compliance.contentPolicyAcceptedAt,
          signupIp: input.signupIp,
          signupUserAgent: input.signupUserAgent,
        },
      });
      return mapToDomain(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return { type: "email-already-in-use" };
      }
      throw error;
    }
  }
}

function mapToDomain(row: PrismaUserRow): User {
  const emailResult = EmailAddress.create(row.email);
  if (!emailResult.ok) {
    // Persistence invariant violation — an invalid email made it into the DB.
    // Fail loud so operations notice, don't silently degrade.
    throw new Error(
      `[PrismaUserRepository] stored email failed validation: ${row.email}`,
    );
  }
  const props: UserProps = {
    id: row.id,
    email: emailResult.value,
    name: row.name,
    passwordHash: row.passwordHash ?? "",
    role: row.role,
    status: row.status,
    compliance: {
      ageConfirmedAt: row.ageConfirmedAt,
      tosAcceptedAt: row.tosAcceptedAt,
      privacyAcceptedAt: row.privacyAcceptedAt,
      contentPolicyAcceptedAt: row.contentPolicyAcceptedAt,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  return User.restore(props);
}
