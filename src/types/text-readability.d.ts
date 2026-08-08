declare module "text-readability" {
  interface TextReadability {
    fleschReadingEase(text: string): number;
    fleschKincaidGrade(text: string): number;
    smogIndex(text: string): number;
    colemanLiauIndex(text: string): number;
    automatedReadabilityIndex(text: string): number;
    daleChallReadabilityScore(text: string): number;
    gunningFog(text: string): number;
    textStandard(text: string, floatOutput?: boolean): string;
    syllableCount(text: string): number;
    lexiconCount(text: string, removePunctuation?: boolean): number;
    sentenceCount(text: string): number;
  }

  const readability: TextReadability;
  export default readability;
}
