/*
  Warnings:

  - You are about to drop the column `whatsappPhoneNumberId` on the `Imobiliaria` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Imobiliaria_whatsappPhoneNumberId_key";

-- AlterTable
ALTER TABLE "Imobiliaria" DROP COLUMN "whatsappPhoneNumberId";
