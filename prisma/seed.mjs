// Carga las etapas del pipeline de ventas. Se puede correr varias veces sin duplicar.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const stages = [
  { position: 1, name: "Nuevo", probability: 5 },
  { position: 2, name: "Contactado", probability: 10 },
  { position: 3, name: "Calificado", probability: 25 },
  { position: 4, name: "Presupuesto enviado", probability: 50 },
  { position: 5, name: "Negociación", probability: 70 },
  { position: 6, name: "Ganado (seña cobrada)", probability: 100, isWon: true },
  { position: 7, name: "Perdido", probability: 0, isLost: true },
];

for (const stage of stages) {
  await prisma.pipelineStage.upsert({
    where: { position: stage.position },
    update: stage,
    create: stage,
  });
}

console.log(`Etapas cargadas: ${stages.length}`);
await prisma.$disconnect();
