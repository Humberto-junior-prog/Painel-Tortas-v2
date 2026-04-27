import { GoogleGenAI } from "@google/genai";

async function generatePreview() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          text: "A high-fidelity UI design for a professional kitchen management dashboard. The screen shows a 'Planning Grid' (Grade de Planejamento) for a bakery/pie shop. It's a clean, modern web interface. The main content is a large data table. Rows are product names like 'Empadão', 'Lasanha de Carne', 'Panqueca Frango'. Columns are days of the week: 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'. Inside the cells are bold numbers representing quantities. At the bottom of each column, there's a 'Total' row with a highlighted sum. Above the table, there's a selector for sectors like 'Centro Manhã', 'Sabugo', 'Lages'. The style is professional, using a color palette of indigo, slate gray, and white. The interface looks intuitive and easy to read at a glance, with a focus on planning the whole week's production.",
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: "16:9",
      },
    },
  });

  // This is a conceptual script, the actual image will be returned in the response parts.
}
