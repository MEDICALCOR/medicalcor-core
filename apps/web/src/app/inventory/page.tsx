'use client';

import { useState } from 'react';
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  TrendingUp,
  Edit,
  Trash2,
  Download,
  ShoppingCart,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  sku: string;
  quantity: number;
  minStock: number;
  unit: string;
  price: number;
  supplier: string;
  lastRestocked: Date;
}

const inventory: InventoryItem[] = [
  {
    id: 'i1',
    name: 'Mănuși latex M',
    category: 'Consumabile',
    sku: 'MNS-001',
    quantity: 450,
    minStock: 100,
    unit: 'buc',
    price: 0.5,
    supplier: 'MedSupply',
    lastRestocked: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'i2',
    name: 'Seringi 5ml',
    category: 'Consumabile',
    sku: 'SRG-005',
    quantity: 280,
    minStock: 200,
    unit: 'buc',
    price: 0.3,
    supplier: 'MedSupply',
    lastRestocked: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'i3',
    name: 'Vaccin gripal',
    category: 'Medicamente',
    sku: 'VAC-GRP',
    quantity: 45,
    minStock: 50,
    unit: 'doze',
    price: 35,
    supplier: 'PharmaCo',
    lastRestocked: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'i4',
    name: 'Paracetamol 500mg',
    category: 'Medicamente',
    sku: 'MED-001',
    quantity: 320,
    minStock: 100,
    unit: 'cutii',
    price: 8,
    supplier: 'PharmaCo',
    lastRestocked: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'i5',
    name: 'Bandaje elastice',
    category: 'Consumabile',
    sku: 'BND-ELS',
    quantity: 85,
    minStock: 50,
    unit: 'role',
    price: 12,
    supplier: 'MedSupply',
    lastRestocked: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'i6',
    name: 'Alcool sanitar 70%',
    category: 'Dezinfectanți',
    sku: 'ALC-070',
    quantity: 25,
    minStock: 30,
    unit: 'litri',
    price: 15,
    supplier: 'CleanMed',
    lastRestocked: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'i7',
    name: 'Gel dezinfectant',
    category: 'Dezinfectanți',
    sku: 'GEL-DZF',
    quantity: 48,
    minStock: 20,
    unit: 'sticle',
    price: 18,
    supplier: 'CleanMed',
    lastRestocked: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  },
];

export default function InventoryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const lowStockItems = inventory.filter((item) => item.quantity <= item.minStock);
  const totalValue = inventory.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const categories = [...new Set(inventory.map((item) => item.category))];

  const filteredInventory = inventory.filter((item) => {
    const matchesSearch =
      searchQuery === '' ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const getStockStatus = (item: InventoryItem) => {
    const ratio = item.quantity / item.minStock;
    if (ratio <= 0.5) return { label: 'Critic', color: 'bg-red-100 text-red-700' };
    if (ratio <= 1) return { label: 'Scăzut', color: 'bg-yellow-100 text-yellow-700' };
    return { label: 'OK', color: 'bg-green-100 text-green-700' };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            Gestiune Stocuri
          </h1>
          <p className="text-muted-foreground mt-1">Administrează inventarul clinicii</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Adaugă produs
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total produse</p>
              <p className="text-xl font-bold">{inventory.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Valoare stoc</p>
              <p className="text-xl font-bold">{totalValue.toLocaleString()} RON</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Stoc scăzut</p>
              <p className="text-xl font-bold">{lowStockItems.length} produse</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <ShoppingCart className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Comenzi în așteptare</p>
              <p className="text-xl font-bold">3</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {lowStockItems.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <h4 className="font-medium">Produse cu stoc scăzut</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {lowStockItems.map((item) => (
                <Badge key={item.id} variant="outline" className="bg-white dark:bg-background">
                  {item.name}: {item.quantity} {item.unit}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle>Inventar</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Caută produs..."
                  className="pl-9 w-[200px]"
                  value={searchQuery}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSearchQuery(e.target.value)
                  }
                />
              </div>
              <Select
                value={categoryFilter}
                onValueChange={(value: string) => setCategoryFilter(value)}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Categorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toate</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produs</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Categorie</TableHead>
                <TableHead>Stoc</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Preț/unitate</TableHead>
                <TableHead className="text-right">Acțiuni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInventory.map((item) => {
                const status = getStockStatus(item);
                const stockRatio = Math.min((item.quantity / item.minStock) * 100, 100);

                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.supplier}</div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="text-sm">
                          {item.quantity} / {item.minStock} {item.unit}
                        </div>
                        <Progress value={stockRatio} className="h-1.5 w-20" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn('text-xs', status.color)}>{status.label}</Badge>
                    </TableCell>
                    <TableCell>{item.price} RON</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
