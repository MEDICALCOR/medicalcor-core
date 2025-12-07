import type { Meta, StoryObj } from '@storybook/react';
import { MoreHorizontal, ArrowUpDown, ChevronDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '../table';
import { Badge } from '../badge';
import { Button } from '../button';
import { Checkbox } from '../checkbox';

const meta = {
  title: 'UI/Table',
  component: Table,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[700px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">Ion Popescu</TableCell>
          <TableCell>ion@example.com</TableCell>
          <TableCell>Active</TableCell>
          <TableCell className="text-right">€250.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Maria Ionescu</TableCell>
          <TableCell>maria@example.com</TableCell>
          <TableCell>Active</TableCell>
          <TableCell className="text-right">€150.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Alexandru Dumitrescu</TableCell>
          <TableCell>alex@example.com</TableCell>
          <TableCell>Inactive</TableCell>
          <TableCell className="text-right">€350.00</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

export const WithCaption: Story = {
  render: () => (
    <Table>
      <TableCaption>A list of recent appointments.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Patient</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Procedure</TableHead>
          <TableHead className="text-right">Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">Ion Popescu</TableCell>
          <TableCell>Dec 22, 2024</TableCell>
          <TableCell>Checkup</TableCell>
          <TableCell className="text-right">€50.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Maria Ionescu</TableCell>
          <TableCell>Dec 23, 2024</TableCell>
          <TableCell>Cleaning</TableCell>
          <TableCell className="text-right">€75.00</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

export const WithFooter: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Procedure</TableHead>
          <TableHead>Quantity</TableHead>
          <TableHead className="text-right">Unit Price</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">Dental Checkup</TableCell>
          <TableCell>1</TableCell>
          <TableCell className="text-right">€50.00</TableCell>
          <TableCell className="text-right">€50.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Teeth Cleaning</TableCell>
          <TableCell>1</TableCell>
          <TableCell className="text-right">€75.00</TableCell>
          <TableCell className="text-right">€75.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">X-Ray</TableCell>
          <TableCell>2</TableCell>
          <TableCell className="text-right">€25.00</TableCell>
          <TableCell className="text-right">€50.00</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>Total</TableCell>
          <TableCell className="text-right font-bold">€175.00</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
};

export const PatientList: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[50px]">
            <Checkbox />
          </TableHead>
          <TableHead>Patient</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>Lead Score</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-[50px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>
            <Checkbox />
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                IP
              </div>
              <div>
                <p className="font-medium">Ion Popescu</p>
                <p className="text-sm text-muted-foreground">ion@example.com</p>
              </div>
            </div>
          </TableCell>
          <TableCell>+40 721 234 567</TableCell>
          <TableCell>
            <Badge variant="hot">85</Badge>
          </TableCell>
          <TableCell>
            <Badge variant="success">Active</Badge>
          </TableCell>
          <TableCell>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell>
            <Checkbox />
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                MI
              </div>
              <div>
                <p className="font-medium">Maria Ionescu</p>
                <p className="text-sm text-muted-foreground">maria@example.com</p>
              </div>
            </div>
          </TableCell>
          <TableCell>+40 722 345 678</TableCell>
          <TableCell>
            <Badge variant="warm">62</Badge>
          </TableCell>
          <TableCell>
            <Badge variant="success">Active</Badge>
          </TableCell>
          <TableCell>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell>
            <Checkbox />
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                AD
              </div>
              <div>
                <p className="font-medium">Alexandru Dumitrescu</p>
                <p className="text-sm text-muted-foreground">alex@example.com</p>
              </div>
            </div>
          </TableCell>
          <TableCell>+40 723 456 789</TableCell>
          <TableCell>
            <Badge variant="cold">28</Badge>
          </TableCell>
          <TableCell>
            <Badge variant="secondary">Inactive</Badge>
          </TableCell>
          <TableCell>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

export const AppointmentsTable: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <Button variant="ghost" size="sm" className="-ml-3">
              Date & Time
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          </TableHead>
          <TableHead>Patient</TableHead>
          <TableHead>Procedure</TableHead>
          <TableHead>Doctor</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>
            <div>
              <p className="font-medium">Dec 22, 2024</p>
              <p className="text-sm text-muted-foreground">10:00 AM</p>
            </div>
          </TableCell>
          <TableCell>Ion Popescu</TableCell>
          <TableCell>Routine Checkup</TableCell>
          <TableCell>Dr. Maria Ionescu</TableCell>
          <TableCell>
            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Confirmed</Badge>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell>
            <div>
              <p className="font-medium">Dec 22, 2024</p>
              <p className="text-sm text-muted-foreground">11:30 AM</p>
            </div>
          </TableCell>
          <TableCell>Maria Ionescu</TableCell>
          <TableCell>Teeth Cleaning</TableCell>
          <TableCell>Dr. Ion Popescu</TableCell>
          <TableCell>
            <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell>
            <div>
              <p className="font-medium">Dec 22, 2024</p>
              <p className="text-sm text-muted-foreground">2:00 PM</p>
            </div>
          </TableCell>
          <TableCell>Alexandru Dumitrescu</TableCell>
          <TableCell>Consultation</TableCell>
          <TableCell>Dr. Elena Dumitrescu</TableCell>
          <TableCell>
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Completed</Badge>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell>
            <div>
              <p className="font-medium">Dec 23, 2024</p>
              <p className="text-sm text-muted-foreground">9:00 AM</p>
            </div>
          </TableCell>
          <TableCell>Ana Vasilescu</TableCell>
          <TableCell>Root Canal</TableCell>
          <TableCell>Dr. Maria Ionescu</TableCell>
          <TableCell>
            <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelled</Badge>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

export const InvoicesTable: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Patient</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">#INV-001</TableCell>
          <TableCell>Ion Popescu</TableCell>
          <TableCell>Dec 15, 2024</TableCell>
          <TableCell>
            <Badge variant="success">Paid</Badge>
          </TableCell>
          <TableCell className="text-right">€250.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">#INV-002</TableCell>
          <TableCell>Maria Ionescu</TableCell>
          <TableCell>Dec 16, 2024</TableCell>
          <TableCell>
            <Badge variant="secondary">Pending</Badge>
          </TableCell>
          <TableCell className="text-right">€175.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">#INV-003</TableCell>
          <TableCell>Alexandru Dumitrescu</TableCell>
          <TableCell>Dec 17, 2024</TableCell>
          <TableCell>
            <Badge variant="destructive">Overdue</Badge>
          </TableCell>
          <TableCell className="text-right">€320.00</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={4}>Total Outstanding</TableCell>
          <TableCell className="text-right font-bold">€495.00</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
};
