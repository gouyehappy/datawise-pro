package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.common.ExplorerConnectionException;
import org.apache.datawise.backend.connector.catalog.SchemaSession;
import org.apache.datawise.backend.config.ExplorerSchemaProperties;
import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.CatalogSchemaScope;
import org.apache.datawise.backend.service.InstanceWorkspaceService;
import org.apache.datawise.backend.service.ViewModelService;
import org.apache.datawise.backend.service.semantic.AiPlatformExplorerService;
import org.springframework.stereotype.Service;

import java.util.List;

/** Explorer schema 树节点子级解析（database / schema / table / folder 等）。 */
@Service
public class ExplorerNodeResolver {

    private final ExplorerTreeBuilder treeBuilder;
    private final InstanceWorkspaceService instanceWorkspaceService;
    private final ViewModelService viewModelService;
    private final AiPlatformExplorerService aiPlatformExplorerService;
    private final ExplorerSchemaProperties schemaProperties;

    public ExplorerNodeResolver(
            ExplorerTreeBuilder treeBuilder,
            InstanceWorkspaceService instanceWorkspaceService,
            ViewModelService viewModelService,
            AiPlatformExplorerService aiPlatformExplorerService,
            ExplorerSchemaProperties schemaProperties
    ) {
        this.treeBuilder = treeBuilder;
        this.instanceWorkspaceService = instanceWorkspaceService;
        this.viewModelService = viewModelService;
        this.aiPlatformExplorerService = aiPlatformExplorerService;
        this.schemaProperties = schemaProperties;
    }

    public static ExplorerConnectionException nodeNotFound() {
        return new ExplorerConnectionException(
                "Schema node not found; refresh Explorer and try again",
                "EXPLORER_NODE_NOT_FOUND"
        );
    }

    public List<TreeNode> resolveChildren(
            SchemaSession session,
            List<TreeNode> schemaRoots,
            TreeNode target
    ) throws Exception {
        return resolveChildren(session, schemaRoots, target, ExplorerLoadOptions.of(null, false), null);
    }

    public List<TreeNode> resolveChildren(
            SchemaSession session,
            List<TreeNode> schemaRoots,
            TreeNode target,
            ExplorerLoadOptions options
    ) throws Exception {
        return resolveChildren(session, schemaRoots, target, options, null);
    }

    public List<TreeNode> resolveChildren(
            SchemaSession session,
            List<TreeNode> schemaRoots,
            TreeNode target,
            ExplorerLoadOptions options,
            String dbType
    ) throws Exception {
        ExplorerLoadOptions loadOptions = options != null ? options : ExplorerLoadOptions.of(null, false);
        return switch (target.getType()) {
            case "database" -> session.loadDatabaseChildren(target.getLabel());
            case "schema" -> {
                String catalog = treeBuilder.findDatabaseCatalog(schemaRoots, target.getId());
                if (catalog == null) {
                    throw new IllegalArgumentException("Catalog not found for schema node");
                }
                yield session.loadSchemaChildren(catalog, target.getLabel());
            }
            case "table" -> {
                ExplorerTreeBuilder.CatalogSchemaContext context =
                        treeBuilder.findCatalogSchemaContext(schemaRoots, target.getId(), dbType);
                if (context == null) {
                    throw new IllegalArgumentException("Catalog not found for table node");
                }
                if (context.schema() != null) {
                    yield session.loadTableSkeletonChildren(context.catalog(), context.schema(), target.getLabel());
                }
                yield session.loadTableSkeletonChildren(context.catalog(), target.getLabel());
            }
            case "view" -> {
                ExplorerTreeBuilder.CatalogSchemaContext context =
                        treeBuilder.findCatalogSchemaContext(schemaRoots, target.getId(), dbType);
                if (context == null) {
                    throw new IllegalArgumentException("Catalog not found for view node");
                }
                if (context.schema() != null) {
                    yield session.loadViewSkeletonChildren(context.catalog(), context.schema(), target.getLabel());
                }
                yield session.loadViewSkeletonChildren(context.catalog(), target.getLabel());
            }
            case "columns", "keys", "indexes" -> loadRelationSectionChildren(session, schemaRoots, target, dbType);
            case "folder" -> resolveFolderChildren(session, schemaRoots, target, loadOptions, dbType);
            default -> target.getChildren() != null ? target.getChildren() : List.of();
        };
    }

    private List<TreeNode> resolveFolderChildren(
            SchemaSession session,
            List<TreeNode> schemaRoots,
            TreeNode target,
            ExplorerLoadOptions options,
            String dbType
    ) throws Exception {
        if ("tables".equalsIgnoreCase(target.getLabel())) {
            ExplorerTreeBuilder.CatalogSchemaContext context = resolveTablesFolderContext(schemaRoots, target, dbType);
            int pageSize = resolvePageSize(options);
            int offset = options.resolvedOffset();
            PaginatedTreeNodes page = session.loadTableListPage(
                    context.catalog(),
                    context.schema(),
                    offset,
                    pageSize,
                    options.skeleton(),
                    options.pattern()
            );
            return page.appendLoadMoreNode(loadMoreNodeId(target), "Load more");
        }
        if ("workspaces".equalsIgnoreCase(target.getLabel())) {
            ExplorerTreeBuilder.CatalogSchemaContext context = resolveTablesFolderContext(schemaRoots, target, dbType);
            String instanceKey = CatalogSchemaScope.formatInstanceKey(context.catalog(), context.schema());
            return instanceWorkspaceService.listSqlFileNodes(session.connectionId(), instanceKey);
        }
        if ("views".equalsIgnoreCase(target.getLabel())) {
            ExplorerTreeBuilder.CatalogSchemaContext context = resolveTablesFolderContext(schemaRoots, target, dbType);
            int pageSize = resolvePageSize(options);
            int offset = options.resolvedOffset();
            PaginatedTreeNodes page = session.loadViewListPage(
                    context.catalog(),
                    context.schema(),
                    offset,
                    pageSize,
                    options.pattern()
            );
            return page.appendLoadMoreNode(loadMoreNodeId(target), "Load more");
        }
        if ("functions".equalsIgnoreCase(target.getLabel())) {
            return loadRoutineFolderChildren(session, schemaRoots, target, options, dbType, "functions");
        }
        if ("procedures".equalsIgnoreCase(target.getLabel())) {
            return loadRoutineFolderChildren(session, schemaRoots, target, options, dbType, "procedures");
        }
        if ("triggers".equalsIgnoreCase(target.getLabel())) {
            return loadRoutineFolderChildren(session, schemaRoots, target, options, dbType, "triggers");
        }
        if ("models".equalsIgnoreCase(target.getLabel())) {
            ExplorerTreeBuilder.CatalogSchemaContext context = resolveTablesFolderContext(schemaRoots, target, dbType);
            String instanceKey = CatalogSchemaScope.formatInstanceKey(context.catalog(), context.schema());
            return viewModelService.listViewModelNodes(session.connectionId(), instanceKey);
        }
        if ("ai".equalsIgnoreCase(target.getLabel()) || "semantics".equalsIgnoreCase(target.getLabel())) {
            ExplorerTreeBuilder.CatalogSchemaContext context = resolveTablesFolderContext(schemaRoots, target, dbType);
            String instanceKey = CatalogSchemaScope.formatInstanceKey(context.catalog(), context.schema());
            return aiPlatformExplorerService.listFeatureNodes(session.connectionId(), instanceKey);
        }
        return target.getChildren() != null ? target.getChildren() : List.of();
    }

    public static boolean isTablesFolder(TreeNode target) {
        return target != null && "folder".equals(target.getType()) && "tables".equalsIgnoreCase(target.getLabel());
    }

    public static boolean isViewsFolder(TreeNode target) {
        return target != null && "folder".equals(target.getType()) && "views".equalsIgnoreCase(target.getLabel());
    }

    /** Tables/views/functions/procedures/triggers folders share offset/limit paging + append-on-load-more semantics. */
    public static boolean isPagedListFolder(TreeNode target) {
        return isTablesFolder(target)
                || isViewsFolder(target)
                || isFunctionsFolder(target)
                || isProceduresFolder(target)
                || isTriggersFolder(target);
    }

    public static boolean isFunctionsFolder(TreeNode target) {
        return target != null && "folder".equals(target.getType()) && "functions".equalsIgnoreCase(target.getLabel());
    }

    public static boolean isProceduresFolder(TreeNode target) {
        return target != null && "folder".equals(target.getType()) && "procedures".equalsIgnoreCase(target.getLabel());
    }

    public static boolean isTriggersFolder(TreeNode target) {
        return target != null && "folder".equals(target.getType()) && "triggers".equalsIgnoreCase(target.getLabel());
    }

    public static boolean isLazyLoadFolder(TreeNode target) {
        return target != null
                && "folder".equals(target.getType())
                && ExplorerTreeMarkers.supportsLazyLoadFolderLabel(target.getLabel());
    }

    private static String loadMoreNodeId(TreeNode folderNode) {
        return folderNode.getId() + ":load-more";
    }

    private ExplorerTreeBuilder.CatalogSchemaContext resolveTablesFolderContext(
            List<TreeNode> schemaRoots,
            TreeNode folderNode,
            String dbType
    ) {
        TreeNode schemaNode = treeBuilder.findParentById(schemaRoots, folderNode.getId());
        if (schemaNode != null && "schema".equals(schemaNode.getType())) {
            TreeNode catalogNode = treeBuilder.findParentById(schemaRoots, schemaNode.getId());
            if (catalogNode == null || !"database".equals(catalogNode.getType())) {
                throw new IllegalArgumentException("Parent catalog not found for schema tables folder");
            }
            return new ExplorerTreeBuilder.CatalogSchemaContext(catalogNode.getLabel(), schemaNode.getLabel());
        }
        TreeNode databaseNode = treeBuilder.findParentById(schemaRoots, folderNode.getId());
        if (databaseNode == null || !"database".equals(databaseNode.getType())) {
            throw new IllegalArgumentException("Parent database not found for tables folder");
        }
        String schemaLabel = databaseNode.getLabel();
        if (DbType.isSchemaRootFamily(dbType)) {
            return new ExplorerTreeBuilder.CatalogSchemaContext(null, schemaLabel);
        }
        return new ExplorerTreeBuilder.CatalogSchemaContext(schemaLabel, null);
    }

    private List<TreeNode> loadRoutineFolderChildren(
            SchemaSession session,
            List<TreeNode> schemaRoots,
            TreeNode target,
            ExplorerLoadOptions options,
            String dbType,
            String folderLabel
    ) throws Exception {
        ExplorerTreeBuilder.CatalogSchemaContext context = resolveTablesFolderContext(schemaRoots, target, dbType);
        int pageSize = resolvePageSize(options);
        int offset = options.resolvedOffset();
        String pattern = options.pattern();
        PaginatedTreeNodes page = switch (folderLabel.toLowerCase(java.util.Locale.ROOT)) {
            case "functions" -> session.loadFunctionListPage(
                    context.catalog(), context.schema(), offset, pageSize, pattern);
            case "procedures" -> session.loadProcedureListPage(
                    context.catalog(), context.schema(), offset, pageSize, pattern);
            case "triggers" -> session.loadTriggerListPage(
                    context.catalog(), context.schema(), offset, pageSize, pattern);
            default -> PaginatedTreeNodes.empty();
        };
        return page.appendLoadMoreNode(loadMoreNodeId(target), "Load more");
    }

    private int resolvePageSize(ExplorerLoadOptions options) {
        return options.limit() != null && options.limit() > 0
                ? options.limit()
                : schemaProperties.getTableListPageSize();
    }

    private List<TreeNode> loadRelationSectionChildren(
            SchemaSession session,
            List<TreeNode> schemaRoots,
            TreeNode target,
            String dbType
    ) throws Exception {
        TreeNode relationNode = treeBuilder.findParentById(schemaRoots, target.getId());
        if (relationNode == null
                || (!"table".equals(relationNode.getType()) && !"view".equals(relationNode.getType()))) {
            throw new IllegalArgumentException("Parent table or view not found for section node");
        }
        ExplorerTreeBuilder.CatalogSchemaContext context =
                treeBuilder.findCatalogSchemaContext(schemaRoots, relationNode.getId(), dbType);
        if (context == null) {
            throw new IllegalArgumentException("Catalog not found for table section node");
        }
        String relationName = relationNode.getLabel();
        boolean view = "view".equals(relationNode.getType());
        if (view && ("keys".equals(target.getType()) || "indexes".equals(target.getType()))) {
            return List.of();
        }
        if (context.schema() != null) {
            return switch (target.getType()) {
                case "columns" -> session.loadColumnChildren(context.catalog(), context.schema(), relationName);
                case "keys" -> view ? List.of() : session.loadKeyChildren(context.catalog(), context.schema(), relationName);
                case "indexes" -> view ? List.of() : session.loadIndexChildren(context.catalog(), context.schema(), relationName);
                default -> List.of();
            };
        }
        return switch (target.getType()) {
            case "columns" -> session.loadColumnChildren(context.catalog(), relationName);
            case "keys" -> view ? List.of() : session.loadKeyChildren(context.catalog(), relationName);
            case "indexes" -> view ? List.of() : session.loadIndexChildren(context.catalog(), relationName);
            default -> List.of();
        };
    }
}
