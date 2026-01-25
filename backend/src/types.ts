/**
 * 共享类型定义
 */

// 前端兼容的类型
export interface ProjectNode {
  id: string;
  name: string;
  type: 'folder' | 'device' | 'block' | 'tag_table' | 'config' | 'settings';
  color?: string;
  is_open?: boolean;
  children?: ProjectNode[];
  parent_id?: string;
}

export interface TagDefinition {
  id: string;
  name: string;
  address: string;
  data_type: string;
  comment?: string;
  is_retentive?: boolean;
}

export interface Network {
  id: string;
  title: string;
  description: string;
  rungs: LadderRung[];
}

export interface LadderRung {
  id: string;
  elements: LadderElement[];
  hasBranch?: boolean;
  branchElement?: LadderElement;
}

export interface LadderElement {
  id: string;
  type: string;
  tag: string;
  address: string;
  comment?: string;
  parameters?: Array<{ name: string; value: string }>;
}

// API 请求/响应类型
export interface CreateProjectRequest {
  name: string;
  description?: string;
  created_by?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
}

export interface CreateNodeRequest {
  parent_id?: string;
  name: string;
  type: ProjectNode['type'];
  color?: string;
}

export interface CreateTagRequest {
  name: string;
  address: string;
  data_type: string;
  comment?: string;
  is_retentive?: boolean;
}

export interface UpdateTagRequest {
  name?: string;
  address?: string;
  data_type?: string;
  comment?: string;
  is_retentive?: boolean;
}

export interface SaveBlockRequest {
  content: any;
  version: number;
}

// 错误响应类型
export interface APIError {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

// 分页响应类型
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
