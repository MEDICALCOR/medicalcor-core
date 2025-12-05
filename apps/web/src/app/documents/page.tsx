'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  getDocumentsAction,
  getFoldersAction,
  getDocumentsStatsAction,
  deleteDocumentAction,
  type Document,
  type DocumentFolder,
  type DocumentsStats,
} from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import {
  FileText,
  Upload,
  Download,
  Search,
  Folder,
  File,
  Image,
  FileSpreadsheet,
  Trash2,
  Eye,
  Share2,
  MoreVertical,
  Grid,
  List,
  Filter,
  Plus,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const typeIcons = {
  pdf: FileText,
  image: Image,
  spreadsheet: FileSpreadsheet,
  document: File,
};

const categoryLabels = {
  consent: 'Consimțământ',
  lab_result: 'Analize',
  prescription: 'Rețetă',
  imaging: 'Imagistică',
  report: 'Raport',
  other: 'Altele',
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [stats, setStats] = useState<DocumentsStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const { toast } = useToast();

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [documentsResult, foldersResult, statsResult] = await Promise.all([
        getDocumentsAction(),
        getFoldersAction(),
        getDocumentsStatsAction(),
      ]);

      setDocuments(documentsResult.documents);
      setFolders(foldersResult.folders);
      setStats(statsResult.stats);
    } catch (_error) {
      toast({
        title: 'Eroare',
        description: 'Nu s-au putut încărca documentele',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteDocumentAction(id);
      if (result.success) {
        setDocuments((prev) => prev.filter((d) => d.id !== id));
        toast({ title: 'Succes', description: 'Documentul a fost șters' });
      } else {
        toast({ title: 'Eroare', description: result.error, variant: 'destructive' });
      }
    });
  }

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('ro-RO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      searchQuery === '' ||
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.patientName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesCategory = categoryFilter === 'all' || doc.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const usedPercentage = stats?.usedPercentage ?? 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Documente
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestionează documentele și fișierele medicale
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Folder className="h-4 w-4 mr-2" />
            Folder nou
          </Button>
          <Button>
            <Upload className="h-4 w-4 mr-2" />
            Încarcă document
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total documente</p>
              <p className="text-xl font-bold">{stats?.totalDocuments ?? documents.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Folder className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Foldere</p>
              <p className="text-xl font-bold">{stats?.totalFolders ?? folders.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Spațiu de stocare</p>
              <p className="text-sm font-medium">
                {stats?.usedSize ?? '0 GB'} / {stats?.totalSize ?? '0 GB'}
              </p>
            </div>
            <Progress value={usedPercentage} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">{usedPercentage}% utilizat</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Foldere</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {folders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nu există foldere</p>
            ) : (
              folders.map((folder) => (
                <div
                  key={folder.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-8 h-8 rounded flex items-center justify-center',
                        folder.color
                      )}
                    >
                      <Folder className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{folder.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {folder.documentCount} documente
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
            <Button variant="ghost" className="w-full mt-2">
              <Plus className="h-4 w-4 mr-2" />
              Folder nou
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <CardTitle>Toate documentele</CardTitle>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Caută document..."
                    className="pl-9 w-[180px]"
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
                  <SelectTrigger className="w-[130px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Categorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toate</SelectItem>
                    <SelectItem value="consent">Consimțăminte</SelectItem>
                    <SelectItem value="lab_result">Analize</SelectItem>
                    <SelectItem value="prescription">Rețete</SelectItem>
                    <SelectItem value="imaging">Imagistică</SelectItem>
                    <SelectItem value="report">Rapoarte</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex border rounded-lg">
                  <Button
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    size="icon"
                    onClick={() => setViewMode('list')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                    size="icon"
                    onClick={() => setViewMode('grid')}
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredDocuments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nu există documente</p>
              </div>
            ) : viewMode === 'list' ? (
              <div className="space-y-2">
                {filteredDocuments.map((doc) => {
                  const docType = doc.type as keyof typeof typeIcons;
                  const TypeIcon = typeIcons[docType];
                  const category = doc.category as keyof typeof categoryLabels;
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                          <TypeIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {doc.patientName && `${doc.patientName} • `}
                            {doc.size} • {formatDate(doc.uploadedAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {categoryLabels[category]}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={isPending}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Eye className="h-4 w-4 mr-2" />
                              Vizualizează
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Download className="h-4 w-4 mr-2" />
                              Descarcă
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Share2 className="h-4 w-4 mr-2" />
                              Partajează
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleDelete(doc.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Șterge
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDocuments.map((doc) => {
                  const docType = doc.type as keyof typeof typeIcons;
                  const TypeIcon = typeIcons[docType];
                  const category = doc.category as keyof typeof categoryLabels;
                  return (
                    <div
                      key={doc.id}
                      className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <div className="w-full h-24 rounded-lg bg-muted flex items-center justify-center mb-3">
                        <TypeIcon className="h-10 w-10 text-muted-foreground" />
                      </div>
                      <p className="font-medium text-sm truncate">{doc.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{doc.size}</p>
                      <div className="flex items-center justify-between mt-3">
                        <Badge variant="outline" className="text-xs">
                          {categoryLabels[category]}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={isPending}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Eye className="h-4 w-4 mr-2" />
                              Vizualizează
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Download className="h-4 w-4 mr-2" />
                              Descarcă
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleDelete(doc.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Șterge
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
