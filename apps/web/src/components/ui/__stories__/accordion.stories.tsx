import type { Meta, StoryObj } from '@storybook/react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../accordion';

// Using a more flexible meta definition since Accordion is a Radix polymorphic component
// with discriminated union props (type="single" vs type="multiple")
const meta: Meta = {
  title: 'UI/Accordion',
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[500px]">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Accordion type="single" collapsible>
      <AccordionItem value="item-1">
        <AccordionTrigger>Is it accessible?</AccordionTrigger>
        <AccordionContent>Yes. It adheres to the WAI-ARIA design pattern.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Is it styled?</AccordionTrigger>
        <AccordionContent>
          Yes. It comes with default styles that match the other components.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Is it animated?</AccordionTrigger>
        <AccordionContent>
          Yes. It&apos;s animated by default, but you can disable it if you prefer.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const Multiple: Story = {
  render: () => (
    <Accordion type="multiple" defaultValue={['item-1']}>
      <AccordionItem value="item-1">
        <AccordionTrigger>First Section</AccordionTrigger>
        <AccordionContent>
          Content for the first section. Multiple sections can be open at once.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Second Section</AccordionTrigger>
        <AccordionContent>Content for the second section.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Third Section</AccordionTrigger>
        <AccordionContent>Content for the third section.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const DefaultOpen: Story = {
  render: () => (
    <Accordion type="single" collapsible defaultValue="item-2">
      <AccordionItem value="item-1">
        <AccordionTrigger>Collapsed by default</AccordionTrigger>
        <AccordionContent>This section is collapsed by default.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Open by default</AccordionTrigger>
        <AccordionContent>
          This section is open by default using the defaultValue prop.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const FAQ: Story = {
  render: () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Frequently Asked Questions</h3>
      <Accordion type="single" collapsible>
        <AccordionItem value="q1">
          <AccordionTrigger>How do I schedule an appointment?</AccordionTrigger>
          <AccordionContent>
            You can schedule an appointment by calling our office, using our online booking system,
            or through the patient portal. We recommend booking at least 2 weeks in advance for
            routine checkups.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="q2">
          <AccordionTrigger>What insurance do you accept?</AccordionTrigger>
          <AccordionContent>
            We accept most major dental insurance plans including Delta Dental, Cigna, Aetna, and
            MetLife. Please contact our office to verify your specific plan coverage.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="q3">
          <AccordionTrigger>What should I bring to my first appointment?</AccordionTrigger>
          <AccordionContent>
            Please bring a valid ID, your insurance card, a list of current medications, and any
            relevant dental records or X-rays from previous dentists.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="q4">
          <AccordionTrigger>Do you offer emergency dental services?</AccordionTrigger>
          <AccordionContent>
            Yes, we offer emergency dental services during business hours. For after-hours
            emergencies, please call our emergency line for instructions.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  ),
};

export const PatientHistory: Story = {
  render: () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Patient Medical History</h3>
      <Accordion type="multiple" defaultValue={['current']}>
        <AccordionItem value="current">
          <AccordionTrigger>Current Medications</AccordionTrigger>
          <AccordionContent>
            <ul className="list-disc pl-4 space-y-1 text-sm">
              <li>Lisinopril 10mg - Once daily</li>
              <li>Metformin 500mg - Twice daily</li>
              <li>Aspirin 81mg - Once daily</li>
            </ul>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="allergies">
          <AccordionTrigger>Known Allergies</AccordionTrigger>
          <AccordionContent>
            <ul className="list-disc pl-4 space-y-1 text-sm">
              <li>Penicillin - Severe reaction</li>
              <li>Latex - Mild skin irritation</li>
            </ul>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="conditions">
          <AccordionTrigger>Medical Conditions</AccordionTrigger>
          <AccordionContent>
            <ul className="list-disc pl-4 space-y-1 text-sm">
              <li>Type 2 Diabetes - Diagnosed 2018</li>
              <li>Hypertension - Controlled with medication</li>
            </ul>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="procedures">
          <AccordionTrigger>Previous Dental Procedures</AccordionTrigger>
          <AccordionContent>
            <ul className="list-disc pl-4 space-y-1 text-sm">
              <li>Root Canal - Tooth #14 (2020)</li>
              <li>Crown Placement - Tooth #14 (2020)</li>
              <li>Wisdom Teeth Extraction (2015)</li>
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  ),
};
